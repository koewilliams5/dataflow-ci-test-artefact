import { z } from "zod";

export interface OllamaConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export type ChatCompletionResult =
  | { ok: true; content: string }
  | { ok: false; reason: "request_failed" | "invalid_response"; message: string };

const chatCompletionResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string() }),
      }),
    )
    .min(1),
});

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Résout la config Ollama à partir de variables d'env optionnelles (voir
 * ADR-035) : les trois doivent être présentes pour activer les
 * fonctionnalités IA — sinon `null`, jamais une config partielle qui
 * échouerait plus tard de façon confuse.
 */
export function resolveOllamaConfig(input: {
  apiKey: string | undefined;
  baseUrl: string | undefined;
  model: string | undefined;
}): OllamaConfig | null {
  if (!input.apiKey || !input.baseUrl || !input.model) {
    return null;
  }
  return { apiKey: input.apiKey, baseUrl: input.baseUrl, model: input.model };
}

/**
 * Appelle l'endpoint compatible OpenAI d'Ollama (voir ADR-035). Ne lève
 * jamais : toute défaillance (réseau, timeout, réponse malformée) retombe
 * sur une valeur de retour explicite — l'appelant décide comment se
 * dégrader, l'IA ne doit jamais devenir un point de défaillance unique
 * (ADR-034).
 */
export async function requestChatCompletion(
  config: OllamaConfig,
  messages: ChatMessage[],
  options: { timeoutMs?: number } = {},
): Promise<ChatCompletionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ model: config.model, messages }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        reason: "request_failed",
        message: `Le fournisseur IA a répondu avec le statut ${response.status}.`,
      };
    }

    const rawBody: unknown = await response.json();
    const parsed = chatCompletionResponseSchema.safeParse(rawBody);
    const firstChoice = parsed.success ? parsed.data.choices[0] : undefined;
    if (!firstChoice) {
      return {
        ok: false,
        reason: "invalid_response",
        message: "La réponse du fournisseur IA est dans un format inattendu.",
      };
    }

    return { ok: true, content: firstChoice.message.content };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur réseau inconnue.";
    return { ok: false, reason: "request_failed", message };
  } finally {
    clearTimeout(timeout);
  }
}
