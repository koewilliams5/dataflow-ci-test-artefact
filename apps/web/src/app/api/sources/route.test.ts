import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createDataSource = vi.fn();
const listDataSources = vi.fn();

vi.mock("@dataflow-ci/database", () => ({
  dataSourceRepository: {
    createDataSource: (...args: unknown[]) => createDataSource(...args),
    listDataSources: (...args: unknown[]) => listDataSources(...args),
  },
}));

const requireSession = vi.fn();
vi.mock("../../../lib/api/requireSession", () => ({
  requireSession: () => requireSession(),
}));

const { GET, POST } = await import("./route");

const AUTHENTICATED = {
  session: { user: { id: "user-1", email: "demo@dataflow-ci.com" } },
  response: null,
};

const UNAUTHENTICATED = {
  session: null,
  response: NextResponse.json({ error: { message: "Authentification requise." } }, { status: 401 }),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/sources", () => {
  it("401 si non authentifié", async () => {
    requireSession.mockResolvedValue(UNAUTHENTICATED);

    const response = await POST(
      new Request("http://localhost/api/sources", {
        method: "POST",
        body: JSON.stringify({ name: "Test" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(createDataSource).not.toHaveBeenCalled();
  });

  it("400 si le nom est manquant", async () => {
    requireSession.mockResolvedValue(AUTHENTICATED);

    const response = await POST(
      new Request("http://localhost/api/sources", { method: "POST", body: JSON.stringify({}) }),
    );

    expect(response.status).toBe(400);
    expect(createDataSource).not.toHaveBeenCalled();
  });

  it("201 et crée la source si le payload est valide", async () => {
    requireSession.mockResolvedValue(AUTHENTICATED);
    createDataSource.mockResolvedValue({ id: "source-1", name: "Ventes Orange CI" });

    const response = await POST(
      new Request("http://localhost/api/sources", {
        method: "POST",
        body: JSON.stringify({ name: "Ventes Orange CI" }),
      }),
    );

    expect(response.status).toBe(201);
    expect(createDataSource).toHaveBeenCalledWith({
      name: "Ventes Orange CI",
      createdById: "user-1",
    });
  });

  it("400 si le webhookUrl fourni n'est pas une URL valide", async () => {
    requireSession.mockResolvedValue(AUTHENTICATED);

    const response = await POST(
      new Request("http://localhost/api/sources", {
        method: "POST",
        body: JSON.stringify({ name: "Ventes Orange CI", webhookUrl: "pas-une-url" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(createDataSource).not.toHaveBeenCalled();
  });

  it("201 et transmet le webhookUrl fourni", async () => {
    requireSession.mockResolvedValue(AUTHENTICATED);
    createDataSource.mockResolvedValue({ id: "source-1", name: "Ventes Orange CI" });

    const response = await POST(
      new Request("http://localhost/api/sources", {
        method: "POST",
        body: JSON.stringify({ name: "Ventes Orange CI", webhookUrl: "https://example.com/hook" }),
      }),
    );

    expect(response.status).toBe(201);
    expect(createDataSource).toHaveBeenCalledWith({
      name: "Ventes Orange CI",
      createdById: "user-1",
      webhookUrl: "https://example.com/hook",
    });
  });
});

describe("GET /api/sources", () => {
  it("401 si non authentifié", async () => {
    requireSession.mockResolvedValue(UNAUTHENTICATED);

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("200 avec la liste des sources", async () => {
    requireSession.mockResolvedValue(AUTHENTICATED);
    listDataSources.mockResolvedValue([{ id: "source-1", name: "Ventes Orange CI" }]);

    const response = await GET();
    const body = (await response.json()) as unknown[];

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
  });
});
