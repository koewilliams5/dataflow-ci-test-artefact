import { ingestionRepository } from "@dataflow-ci/database";
import { requestChatCompletion, resolveOllamaConfig } from "@dataflow-ci/ai";
import { NextResponse } from "next/server";
import { env } from "../../../../../env";
import { requireSession } from "../../../../../lib/api/requireSession";
import { jsonError } from "../../../../../lib/api/responses";
import { buildErrorExplanationPrompt } from "../../../../../lib/insights/buildErrorExplanationPrompt";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export type CopilotResponseBody =
  | { available: true; explanation: string }
  | {
      available: false;
      reason: "not_configured" | "no_errors" | "request_failed" | "invalid_response";
    };

/**
 * Copilot qualité de données (voir ADR-034/036) : à la demande uniquement,
 * jamais dans le chemin critique du traitement. N'échoue jamais bruyamment —
 * une IA non configurée ou indisponible reste une réponse 200 avec
 * `available: false`, jamais une 500 qui casserait la page.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const { id } = await params;
  const ingestion = await ingestionRepository.findIngestionById(id);
  if (!ingestion) {
    return jsonError(404, "Ingestion introuvable.");
  }

  const errorSummaries = await ingestionRepository.summarizeIngestionErrors(id);
  if (errorSummaries.length === 0) {
    return NextResponse.json<CopilotResponseBody>({ available: false, reason: "no_errors" });
  }

  const config = resolveOllamaConfig({
    apiKey: env.OLLAMA_API_KEY,
    baseUrl: env.OLLAMA_BASE_URL,
    model: env.OLLAMA_MODEL,
  });
  if (!config) {
    return NextResponse.json<CopilotResponseBody>({ available: false, reason: "not_configured" });
  }

  const messages = buildErrorExplanationPrompt({
    totalRows: ingestion.totalRows,
    validRows: ingestion.validRows,
    invalidRows: ingestion.invalidRows,
    errorSummaries,
  });

  const result = await requestChatCompletion(config, messages);
  if (!result.ok) {
    return NextResponse.json<CopilotResponseBody>({ available: false, reason: result.reason });
  }

  return NextResponse.json<CopilotResponseBody>({ available: true, explanation: result.content });
}
