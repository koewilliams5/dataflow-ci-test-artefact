import { afterEach, describe, expect, it, vi } from "vitest";
import { requestChatCompletion, resolveOllamaConfig } from "./ollamaClient";

const CONFIG = { apiKey: "test-key", baseUrl: "https://ollama.example.com", model: "llama3.1" };

describe("resolveOllamaConfig", () => {
  it("retourne la config quand les trois variables sont présentes", () => {
    expect(resolveOllamaConfig(CONFIG)).toEqual(CONFIG);
  });

  it.each([
    { apiKey: undefined, baseUrl: CONFIG.baseUrl, model: CONFIG.model },
    { apiKey: CONFIG.apiKey, baseUrl: undefined, model: CONFIG.model },
    { apiKey: CONFIG.apiKey, baseUrl: CONFIG.baseUrl, model: undefined },
  ])("retourne null si une variable manque (%#)", (input) => {
    expect(resolveOllamaConfig(input)).toBeNull();
  });
});

describe("requestChatCompletion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retourne le contenu du premier choix en cas de succès", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "Résumé généré." } }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestChatCompletion(CONFIG, [{ role: "user", content: "Explique." }]);

    expect(result).toEqual({ ok: true, content: "Résumé généré." });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ollama.example.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
      }),
    );
  });

  it("échoue proprement (request_failed) sur un statut HTTP en erreur", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
    );

    const result = await requestChatCompletion(CONFIG, [{ role: "user", content: "Explique." }]);

    expect(result).toEqual({ ok: false, reason: "request_failed", message: expect.any(String) });
  });

  it("échoue proprement (invalid_response) sur un corps de réponse malformé", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ unexpected: true }), { status: 200 })),
    );

    const result = await requestChatCompletion(CONFIG, [{ role: "user", content: "Explique." }]);

    expect(result).toEqual({ ok: false, reason: "invalid_response", message: expect.any(String) });
  });

  it("échoue proprement (request_failed) sur une erreur réseau", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const result = await requestChatCompletion(CONFIG, [{ role: "user", content: "Explique." }]);

    expect(result).toEqual({ ok: false, reason: "request_failed", message: "ECONNREFUSED" });
  });
});
