import { beforeEach, describe, expect, it, vi } from "vitest";

const findIngestionById = vi.fn();
vi.mock("@dataflow-ci/database", () => ({
  ingestionRepository: {
    findIngestionById: (...args: unknown[]) => findIngestionById(...args),
  },
}));

const requireSession = vi.fn();
vi.mock("../../../../../lib/api/requireSession", () => ({
  requireSession: () => requireSession(),
}));

const getSignedDownloadUrl = vi.fn();
vi.mock("../../../../../lib/storage", () => ({
  getStorageProvider: () => ({
    getSignedDownloadUrl: (...args: unknown[]) => getSignedDownloadUrl(...args),
  }),
}));

const { GET } = await import("./route");

const AUTHENTICATED = { session: { user: { id: "user-1" } }, response: null };

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue(AUTHENTICATED);
});

describe("GET /api/ingestions/[id]/export", () => {
  it("404 si l'ingestion n'existe pas", async () => {
    findIngestionById.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/ingestions/unknown/export"), {
      params: Promise.resolve({ id: "unknown" }),
    });

    expect(response.status).toBe(404);
    expect(getSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it("404 si aucun export n'existe (validFileKey null)", async () => {
    findIngestionById.mockResolvedValue({ id: "ingestion-1", validFileKey: null });

    const response = await GET(new Request("http://localhost/api/ingestions/ingestion-1/export"), {
      params: Promise.resolve({ id: "ingestion-1" }),
    });

    expect(response.status).toBe(404);
    expect(getSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it("redirige vers l'URL signée quand un export existe", async () => {
    findIngestionById.mockResolvedValue({
      id: "ingestion-1",
      validFileKey: "sources/source-1/exports/abc.csv",
    });
    getSignedDownloadUrl.mockResolvedValue("https://minio.local/signed-url");

    const response = await GET(new Request("http://localhost/api/ingestions/ingestion-1/export"), {
      params: Promise.resolve({ id: "ingestion-1" }),
    });

    expect(getSignedDownloadUrl).toHaveBeenCalledWith("sources/source-1/exports/abc.csv");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://minio.local/signed-url");
  });

  it("401 si non authentifié", async () => {
    const unauthenticatedResponse = new Response(null, { status: 401 });
    requireSession.mockResolvedValue({ session: null, response: unauthenticatedResponse });

    const response = await GET(new Request("http://localhost/api/ingestions/ingestion-1/export"), {
      params: Promise.resolve({ id: "ingestion-1" }),
    });

    expect(response.status).toBe(401);
    expect(findIngestionById).not.toHaveBeenCalled();
  });
});
