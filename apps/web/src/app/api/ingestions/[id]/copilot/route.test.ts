import { beforeEach, describe, expect, it, vi } from "vitest";

const findIngestionById = vi.fn();
const summarizeIngestionErrors = vi.fn();

vi.mock("@dataflow-ci/database", () => ({
  ingestionRepository: {
    findIngestionById: (...args: unknown[]) => findIngestionById(...args),
    summarizeIngestionErrors: (...args: unknown[]) => summarizeIngestionErrors(...args),
  },
}));

const requestChatCompletion = vi.fn();
vi.mock("@dataflow-ci/ai", () => ({
  requestChatCompletion: (...args: unknown[]) => requestChatCompletion(...args),
  resolveOllamaConfig: (input: { apiKey?: string; baseUrl?: string; model?: string }) =>
    input.apiKey && input.baseUrl && input.model
      ? { apiKey: input.apiKey, baseUrl: input.baseUrl, model: input.model }
      : null,
}));

vi.mock("../../../../../env", () => ({ env: mockEnv }));

const requireSession = vi.fn();
vi.mock("../../../../../lib/api/requireSession", () => ({
  requireSession: () => requireSession(),
}));

const mockEnv: {
  OLLAMA_API_KEY: string | undefined;
  OLLAMA_BASE_URL: string | undefined;
  OLLAMA_MODEL: string | undefined;
} = {
  OLLAMA_API_KEY: "test-key",
  OLLAMA_BASE_URL: "https://ollama.example.com",
  OLLAMA_MODEL: "llama3.1",
};

const { POST } = await import("./route");

const AUTHENTICATED = { session: { user: { id: "user-1" } }, response: null };

const BASE_INGESTION = {
  id: "ingestion-1",
  totalRows: 5,
  validRows: 3,
  invalidRows: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.OLLAMA_API_KEY = "test-key";
  mockEnv.OLLAMA_BASE_URL = "https://ollama.example.com";
  mockEnv.OLLAMA_MODEL = "llama3.1";
  requireSession.mockResolvedValue(AUTHENTICATED);
  findIngestionById.mockResolvedValue(BASE_INGESTION);
  summarizeIngestionErrors.mockResolvedValue([
    { errorCode: "INVALID_INTEGER", columnName: "montant_fcfa", count: 2 },
  ]);
  requestChatCompletion.mockResolvedValue({ ok: true, content: "Explication générée." });
});

async function callRoute(id = "ingestion-1") {
  return POST(new Request(`http://localhost/api/ingestions/${id}/copilot`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
}

describe("POST /api/ingestions/[id]/copilot", () => {
  it("404 si l'ingestion n'existe pas", async () => {
    findIngestionById.mockResolvedValue(null);
    const response = await callRoute("unknown");
    expect(response.status).toBe(404);
  });

  it("401 si non authentifié", async () => {
    const unauthenticatedResponse = new Response(null, { status: 401 });
    requireSession.mockResolvedValue({ session: null, response: unauthenticatedResponse });
    const response = await callRoute();
    expect(response.status).toBe(401);
    expect(findIngestionById).not.toHaveBeenCalled();
  });

  it("available=false, reason=no_errors si l'ingestion n'a aucune erreur", async () => {
    summarizeIngestionErrors.mockResolvedValue([]);
    const response = await callRoute();
    const body = await response.json();
    expect(body).toEqual({ available: false, reason: "no_errors" });
    expect(requestChatCompletion).not.toHaveBeenCalled();
  });

  it("available=false, reason=not_configured si la clé Ollama est absente", async () => {
    mockEnv.OLLAMA_API_KEY = undefined;
    const response = await callRoute();
    const body = await response.json();
    expect(body).toEqual({ available: false, reason: "not_configured" });
    expect(requestChatCompletion).not.toHaveBeenCalled();
  });

  it("available=true avec l'explication en cas de succès", async () => {
    const response = await callRoute();
    const body = await response.json();
    expect(body).toEqual({ available: true, explanation: "Explication générée." });
  });

  it("propage la raison d'échec du client IA (available=false)", async () => {
    requestChatCompletion.mockResolvedValue({
      ok: false,
      reason: "request_failed",
      message: "Timeout",
    });
    const response = await callRoute();
    const body = await response.json();
    expect(body).toEqual({ available: false, reason: "request_failed" });
  });

  it("n'envoie jamais rawValue au LLM — seulement les comptages agrégés", async () => {
    await callRoute();
    const [, messages] = requestChatCompletion.mock.calls[0] as [unknown, { content: string }[]];
    const fullText = messages.map((message) => message.content).join("\n");
    expect(fullText).not.toMatch(/rawValue/i);
  });
});
