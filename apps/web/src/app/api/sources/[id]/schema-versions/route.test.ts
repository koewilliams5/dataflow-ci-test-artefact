import { beforeEach, describe, expect, it, vi } from "vitest";

class FakeInvalidSchemaDefinitionError extends Error {}

const findDataSourceById = vi.fn();
const createSchemaVersion = vi.fn();
const listSchemaVersions = vi.fn();

vi.mock("@dataflow-ci/database", () => ({
  dataSourceRepository: {
    findDataSourceById: (...args: unknown[]) => findDataSourceById(...args),
  },
  schemaVersionRepository: {
    createSchemaVersion: (...args: unknown[]) => createSchemaVersion(...args),
    listSchemaVersions: (...args: unknown[]) => listSchemaVersions(...args),
  },
  InvalidSchemaDefinitionError: FakeInvalidSchemaDefinitionError,
}));

const requireSession = vi.fn();
vi.mock("../../../../../lib/api/requireSession", () => ({
  requireSession: () => requireSession(),
}));

const { GET, POST } = await import("./route");

const AUTHENTICATED = { session: { user: { id: "user-1" } }, response: null };

beforeEach(() => {
  vi.clearAllMocks();
  findDataSourceById.mockResolvedValue({ id: "source-1" });
});

describe("GET /api/sources/[id]/schema-versions", () => {
  it("404 si la source n'existe pas", async () => {
    requireSession.mockResolvedValue(AUTHENTICATED);
    findDataSourceById.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "unknown" }),
    });

    expect(response.status).toBe(404);
  });

  it("200 avec l'historique des versions", async () => {
    requireSession.mockResolvedValue(AUTHENTICATED);
    listSchemaVersions.mockResolvedValue([{ id: "version-1", versionNumber: 1 }]);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "source-1" }),
    });

    expect(response.status).toBe(200);
  });
});

describe("POST /api/sources/[id]/schema-versions", () => {
  it("400 si le corps ne contient pas `definition`", async () => {
    requireSession.mockResolvedValue(AUTHENTICATED);

    const response = await POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({}) }),
      {
        params: Promise.resolve({ id: "source-1" }),
      },
    );

    expect(response.status).toBe(400);
    expect(createSchemaVersion).not.toHaveBeenCalled();
  });

  it("400 si la définition est invalide (erreur remontée par le repository)", async () => {
    requireSession.mockResolvedValue(AUTHENTICATED);
    createSchemaVersion.mockRejectedValue(
      new FakeInvalidSchemaDefinitionError("Invalid schema definition"),
    );

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ definition: { columns: [] } }),
      }),
      { params: Promise.resolve({ id: "source-1" }) },
    );

    expect(response.status).toBe(400);
  });

  it("201 si la définition est valide", async () => {
    requireSession.mockResolvedValue(AUTHENTICATED);
    createSchemaVersion.mockResolvedValue({ id: "version-1", versionNumber: 1 });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ definition: { columns: [{ name: "id", type: "string" }] } }),
      }),
      { params: Promise.resolve({ id: "source-1" }) },
    );

    expect(response.status).toBe(201);
  });

  it("404 si la source n'existe pas", async () => {
    requireSession.mockResolvedValue(AUTHENTICATED);
    findDataSourceById.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ definition: {} }) }),
      { params: Promise.resolve({ id: "unknown" }) },
    );

    expect(response.status).toBe(404);
    expect(createSchemaVersion).not.toHaveBeenCalled();
  });
});
