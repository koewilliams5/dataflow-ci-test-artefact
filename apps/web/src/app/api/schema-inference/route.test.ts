import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readFileSample = vi.fn();
vi.mock("@dataflow-ci/validation", () => ({
  readFileSample: (...args: unknown[]) => readFileSample(...args),
}));

const requestChatCompletion = vi.fn();
vi.mock("@dataflow-ci/ai", () => ({
  requestChatCompletion: (...args: unknown[]) => requestChatCompletion(...args),
  resolveOllamaConfig: (input: { apiKey?: string; baseUrl?: string; model?: string }) =>
    input.apiKey && input.baseUrl && input.model
      ? { apiKey: input.apiKey, baseUrl: input.baseUrl, model: input.model }
      : null,
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
vi.mock("../../../env", () => ({ env: mockEnv }));

const requireSession = vi.fn();
vi.mock("../../../lib/api/requireSession", () => ({
  requireSession: () => requireSession(),
}));

const { POST } = await import("./route");

const AUTHENTICATED = { session: { user: { id: "user-1" } }, response: null };
const UNAUTHENTICATED = {
  session: null,
  response: NextResponse.json({ error: { message: "Authentification requise." } }, { status: 401 }),
};

const VALID_DEFINITION = {
  columns: [{ name: "montant_fcfa", type: "integer", required: true, unique: false, positive: true }],
  allowExtraColumns: false,
  trimStrings: true,
  caseSensitiveHeaders: false,
};

function makeCsvFile(
  name = "echantillon.csv",
  content = "date,montant_fcfa\n2026-01-01,5000\n",
) {
  return new File([content], name, { type: "text/csv" });
}

function makeUploadRequest(file?: File) {
  const formData = new FormData();
  if (file !== undefined) {
    formData.append("file", file);
  }
  return new Request("http://localhost/api/schema-inference", { method: "POST", body: formData });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.OLLAMA_API_KEY = "test-key";
  mockEnv.OLLAMA_BASE_URL = "https://ollama.example.com";
  mockEnv.OLLAMA_MODEL = "llama3.1";
  requireSession.mockResolvedValue(AUTHENTICATED);
  readFileSample.mockResolvedValue({
    header: ["date", "montant_fcfa"],
    rows: [["2026-01-01", "5000"]],
  });
  requestChatCompletion.mockResolvedValue({ ok: true, content: JSON.stringify(VALID_DEFINITION) });
});

describe("POST /api/schema-inference", () => {
  it("401 si non authentifié", async () => {
    requireSession.mockResolvedValue(UNAUTHENTICATED);
    const response = await POST(makeUploadRequest(makeCsvFile()));
    expect(response.status).toBe(401);
    expect(readFileSample).not.toHaveBeenCalled();
  });

  it("400 si aucun fichier n'est fourni", async () => {
    const response = await POST(makeUploadRequest());
    expect(response.status).toBe(400);
  });

  it("400 si le fichier a une extension non autorisée", async () => {
    const response = await POST(
      makeUploadRequest(new File(["contenu"], "fichier.txt", { type: "text/plain" })),
    );
    expect(response.status).toBe(400);
  });

  it("available=false, reason=not_configured si la clé Ollama est absente", async () => {
    mockEnv.OLLAMA_API_KEY = undefined;
    const response = await POST(makeUploadRequest(makeCsvFile()));
    const body = await response.json();
    expect(body).toEqual({ available: false, reason: "not_configured" });
    expect(readFileSample).not.toHaveBeenCalled();
  });

  it("available=false, reason=malformed_file si l'échantillon est illisible", async () => {
    readFileSample.mockRejectedValue(new Error("Le fichier CSV est illisible ou mal formé."));
    const response = await POST(makeUploadRequest(makeCsvFile()));
    const body = await response.json();
    expect(body).toEqual({ available: false, reason: "malformed_file" });
  });

  it("propage la raison d'échec du client IA (available=false)", async () => {
    requestChatCompletion.mockResolvedValue({
      ok: false,
      reason: "request_failed",
      message: "Timeout",
    });
    const response = await POST(makeUploadRequest(makeCsvFile()));
    const body = await response.json();
    expect(body).toEqual({ available: false, reason: "request_failed" });
  });

  it("available=false, reason=invalid_response si le JSON renvoyé est invalide", async () => {
    requestChatCompletion.mockResolvedValue({ ok: true, content: "pas du json" });
    const response = await POST(makeUploadRequest(makeCsvFile()));
    const body = await response.json();
    expect(body).toEqual({ available: false, reason: "invalid_response" });
  });

  it("available=true avec la définition de schéma en cas de succès", async () => {
    const response = await POST(makeUploadRequest(makeCsvFile()));
    const body = await response.json();
    expect(body.available).toBe(true);
    expect(body.definition.columns).toHaveLength(1);
    expect(body.definition.columns[0].name).toBe("montant_fcfa");
  });
});
