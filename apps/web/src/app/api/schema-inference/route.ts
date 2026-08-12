import { Readable } from "node:stream";
import {
  MAX_FILE_SIZE_BYTES,
  getFileExtension,
  validateUploadedFile,
  type SchemaDefinition,
} from "@dataflow-ci/domain";
import { requestChatCompletion, resolveOllamaConfig } from "@dataflow-ci/ai";
import { readFileSample, type FileFormat } from "@dataflow-ci/validation";
import { NextResponse } from "next/server";
import { env } from "../../../env";
import { requireSession } from "../../../lib/api/requireSession";
import { jsonError } from "../../../lib/api/responses";
import { buildSchemaInferencePrompt } from "../../../lib/insights/buildSchemaInferencePrompt";
import { parseInferredSchema } from "../../../lib/insights/parseInferredSchema";

// Même marge que l'upload d'ingestion (voir /api/ingestions) — métadonnées
// multipart au-delà de la taille du fichier lui-même.
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export type SchemaInferenceResponseBody =
  | { available: true; definition: SchemaDefinition }
  | {
      available: false;
      reason: "not_configured" | "malformed_file" | "request_failed" | "invalid_response";
    };

/**
 * Assistant d'inférence de schéma (voir ADR-039) : à la demande, jamais
 * persisté directement — ne fait que proposer un JSON que l'opérateur revoit
 * dans `SchemaEditor` avant soumission (human-in-the-loop, ADR-034). Le
 * fichier échantillon n'est jamais stocké ni journalisé au-delà de cette
 * requête.
 */
export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const contentLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_FILE_SIZE_BYTES + MULTIPART_OVERHEAD_BYTES
  ) {
    return jsonError(413, "Le fichier dépasse la taille maximale de 10 Mo.");
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return jsonError(400, "Le corps de la requête doit être un formulaire (fichier).");
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return jsonError(400, "Aucun fichier fourni.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const validationError = validateUploadedFile({
    filename: file.name,
    size: buffer.byteLength,
    mimeType: file.type,
    headerBytes: buffer.subarray(0, 8),
  });
  if (validationError) {
    return jsonError(400, validationError.message);
  }

  const config = resolveOllamaConfig({
    apiKey: env.OLLAMA_API_KEY,
    baseUrl: env.OLLAMA_BASE_URL,
    model: env.OLLAMA_MODEL,
  });
  if (!config) {
    return NextResponse.json<SchemaInferenceResponseBody>({
      available: false,
      reason: "not_configured",
    });
  }

  const fileFormat: FileFormat = getFileExtension(file.name) === ".xlsx" ? "xlsx" : "csv";

  let sample;
  try {
    sample = await readFileSample(fileFormat, Readable.from(buffer));
  } catch {
    return NextResponse.json<SchemaInferenceResponseBody>({
      available: false,
      reason: "malformed_file",
    });
  }

  const messages = buildSchemaInferencePrompt(sample);
  const result = await requestChatCompletion(config, messages, { timeoutMs: 30_000 });
  if (!result.ok) {
    return NextResponse.json<SchemaInferenceResponseBody>({
      available: false,
      reason: result.reason,
    });
  }

  const parsed = parseInferredSchema(result.content);
  if (!parsed.success) {
    return NextResponse.json<SchemaInferenceResponseBody>({
      available: false,
      reason: "invalid_response",
    });
  }

  return NextResponse.json<SchemaInferenceResponseBody>({
    available: true,
    definition: parsed.definition,
  });
}
