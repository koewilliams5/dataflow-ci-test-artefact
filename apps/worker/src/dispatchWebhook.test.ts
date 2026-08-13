import { beforeEach, describe, expect, it, vi } from "vitest";

const findDataSourceById = vi.fn();
vi.mock("@dataflow-ci/database", () => ({
  dataSourceRepository: {
    findDataSourceById: (...args: unknown[]) => findDataSourceById(...args),
  },
}));

let webhookSigningSecret: string | undefined;
vi.mock("./env", () => ({
  get env() {
    return { WEBHOOK_SIGNING_SECRET: webhookSigningSecret };
  },
}));

const { dispatchWebhook, notifyIngestionWebhook } = await import("./dispatchWebhook");

const log = {
  child: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const PAYLOAD = {
  ingestionId: "ingestion-1",
  status: "SUCCESS",
  dataSourceName: "Ventes Orange CI",
  originalFilename: "ventes.csv",
  totalRows: 10,
  validRows: 10,
  invalidRows: 0,
  processingCompletedAt: "2026-08-12T10:00:00.000Z",
};

const COMPLETED_INGESTION = {
  id: "ingestion-1",
  dataSourceId: "source-1",
  status: "SUCCESS",
  originalFilename: "ventes.csv",
  totalRows: 10,
  validRows: 10,
  invalidRows: 0,
  processingCompletedAt: new Date("2026-08-12T10:00:00.000Z"),
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  webhookSigningSecret = undefined;
  vi.stubGlobal("fetch", vi.fn());
});

describe("dispatchWebhook", () => {
  it("POST le payload en JSON, sans signature si aucun secret n'est configuré", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

    await dispatchWebhook({ webhookUrl: "https://example.com/hook", payload: PAYLOAD, log });

    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/hook",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(PAYLOAD),
      }),
    );
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-DataFlow-Signature"]).toBeUndefined();
    expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ result: "delivered" }), expect.any(String));
  });

  it("signe le payload en HMAC-SHA256 quand un secret est configuré", async () => {
    webhookSigningSecret = "test-secret";
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

    await dispatchWebhook({ webhookUrl: "https://example.com/hook", payload: PAYLOAD, log });

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-DataFlow-Signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("logue un warning sans lever si la réponse HTTP n'est pas ok", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));

    await expect(
      dispatchWebhook({ webhookUrl: "https://example.com/hook", payload: PAYLOAD, log }),
    ).resolves.toBeUndefined();

    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ result: "http_error" }), expect.any(String));
  });

  it("logue un warning sans lever si fetch échoue (réseau, timeout)", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("Network error"));

    await expect(
      dispatchWebhook({ webhookUrl: "https://example.com/hook", payload: PAYLOAD, log }),
    ).resolves.toBeUndefined();

    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ result: "error" }), expect.any(String));
  });
});

describe("notifyIngestionWebhook", () => {
  it("n'appelle pas fetch si la source n'a pas de webhookUrl", async () => {
    findDataSourceById.mockResolvedValue({ id: "source-1", name: "Ventes Orange CI", webhookUrl: null });

    await notifyIngestionWebhook(COMPLETED_INGESTION, log);

    expect(fetch).not.toHaveBeenCalled();
  });

  it("POST vers le webhookUrl de la source avec le payload dérivé de l'ingestion", async () => {
    findDataSourceById.mockResolvedValue({
      id: "source-1",
      name: "Ventes Orange CI",
      webhookUrl: "https://example.com/hook",
    });
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

    await notifyIngestionWebhook(COMPLETED_INGESTION, log);

    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/hook",
      expect.objectContaining({
        body: JSON.stringify({
          ingestionId: "ingestion-1",
          status: "SUCCESS",
          dataSourceName: "Ventes Orange CI",
          originalFilename: "ventes.csv",
          totalRows: 10,
          validRows: 10,
          invalidRows: 0,
          processingCompletedAt: "2026-08-12T10:00:00.000Z",
        }),
      }),
    );
  });

  it("ne lève pas si la résolution de la source échoue (best-effort)", async () => {
    findDataSourceById.mockRejectedValue(new Error("DB down"));

    await expect(notifyIngestionWebhook(COMPLETED_INGESTION, log)).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ result: "lookup_error" }), expect.any(String));
  });
});
