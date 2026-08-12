import { beforeEach, describe, expect, it, vi } from "vitest";

const findDataSourceById = vi.fn();
const updateDataSource = vi.fn();

vi.mock("@dataflow-ci/database", () => ({
  dataSourceRepository: {
    findDataSourceById: (...args: unknown[]) => findDataSourceById(...args),
    updateDataSource: (...args: unknown[]) => updateDataSource(...args),
  },
}));

const requireSession = vi.fn();
vi.mock("../../../../lib/api/requireSession", () => ({
  requireSession: () => requireSession(),
}));

const { GET, PATCH } = await import("./route");

const AUTHENTICATED = { session: { user: { id: "user-1" } }, response: null };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/sources/[id]", () => {
  it("404 si la source n'existe pas", async () => {
    requireSession.mockResolvedValue(AUTHENTICATED);
    findDataSourceById.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/sources/unknown"), {
      params: Promise.resolve({ id: "unknown" }),
    });

    expect(response.status).toBe(404);
  });

  it("200 avec la source si elle existe", async () => {
    requireSession.mockResolvedValue(AUTHENTICATED);
    findDataSourceById.mockResolvedValue({ id: "source-1", name: "Ventes Orange CI" });

    const response = await GET(new Request("http://localhost/api/sources/source-1"), {
      params: Promise.resolve({ id: "source-1" }),
    });

    expect(response.status).toBe(200);
  });
});

describe("PATCH /api/sources/[id]", () => {
  it("404 si la source n'existe pas", async () => {
    requireSession.mockResolvedValue(AUTHENTICATED);
    findDataSourceById.mockResolvedValue(null);

    const response = await PATCH(
      new Request("http://localhost/api/sources/unknown", {
        method: "PATCH",
        body: JSON.stringify({ name: "X" }),
      }),
      { params: Promise.resolve({ id: "unknown" }) },
    );

    expect(response.status).toBe(404);
    expect(updateDataSource).not.toHaveBeenCalled();
  });

  it("400 si le payload est vide (ni nom ni description)", async () => {
    requireSession.mockResolvedValue(AUTHENTICATED);
    findDataSourceById.mockResolvedValue({ id: "source-1", name: "Ventes Orange CI" });

    const response = await PATCH(
      new Request("http://localhost/api/sources/source-1", {
        method: "PATCH",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "source-1" }) },
    );

    expect(response.status).toBe(400);
    expect(updateDataSource).not.toHaveBeenCalled();
  });

  it("200 et ne met à jour que les champs fournis", async () => {
    requireSession.mockResolvedValue(AUTHENTICATED);
    findDataSourceById.mockResolvedValue({ id: "source-1", name: "Old name" });
    updateDataSource.mockResolvedValue({ id: "source-1", name: "New name" });

    const response = await PATCH(
      new Request("http://localhost/api/sources/source-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "New name" }),
      }),
      { params: Promise.resolve({ id: "source-1" }) },
    );

    expect(response.status).toBe(200);
    expect(updateDataSource).toHaveBeenCalledWith("source-1", { name: "New name" });
  });
});
