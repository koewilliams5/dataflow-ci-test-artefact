import { beforeEach, describe, expect, it, vi } from "vitest";

const findIngestionById = vi.fn();
const countIngestionErrors = vi.fn();
const listIngestionErrorsPage = vi.fn();
const findSchemaVersionById = vi.fn();
const listIngestionColumnStats = vi.fn();
const getHistoricalColumnStatsSummary = vi.fn();

vi.mock("@dataflow-ci/database", () => ({
  ingestionRepository: {
    findIngestionById: (...args: unknown[]) => findIngestionById(...args),
    countIngestionErrors: (...args: unknown[]) => countIngestionErrors(...args),
    listIngestionErrorsPage: (...args: unknown[]) => listIngestionErrorsPage(...args),
    listIngestionColumnStats: (...args: unknown[]) => listIngestionColumnStats(...args),
    getHistoricalColumnStatsSummary: (...args: unknown[]) => getHistoricalColumnStatsSummary(...args),
  },
  schemaVersionRepository: {
    findSchemaVersionById: (...args: unknown[]) => findSchemaVersionById(...args),
  },
}));

const requireSession = vi.fn();
vi.mock("../../../../lib/api/requireSession", () => ({
  requireSession: () => requireSession(),
}));

const { GET } = await import("./route");

const AUTHENTICATED = { session: { user: { id: "user-1" } }, response: null };

const BASE_INGESTION = {
  id: "ingestion-1",
  dataSourceId: "source-1",
  schemaVersionId: "schema-version-1",
  originalFilename: "ventes.csv",
  status: "PARTIAL",
  totalRows: 5,
  validRows: 3,
  invalidRows: 2,
  failureReason: null,
  validFileKey: "sources/source-1/exports/abc.csv",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  processingStartedAt: new Date("2026-01-01T00:00:01.000Z"),
  processingCompletedAt: new Date("2026-01-01T00:00:02.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue(AUTHENTICATED);
  countIngestionErrors.mockResolvedValue(0);
  listIngestionErrorsPage.mockResolvedValue([]);
  findSchemaVersionById.mockResolvedValue({ id: "schema-version-1", versionNumber: 2 });
  listIngestionColumnStats.mockResolvedValue([]);
  getHistoricalColumnStatsSummary.mockResolvedValue([]);
});

describe("GET /api/ingestions/[id]", () => {
  it("404 si l'ingestion n'existe pas", async () => {
    findIngestionById.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/ingestions/unknown"), {
      params: Promise.resolve({ id: "unknown" }),
    });

    expect(response.status).toBe(404);
  });

  it("200 avec les compteurs et hasExport à true quand un export existe", async () => {
    findIngestionById.mockResolvedValue(BASE_INGESTION);

    const response = await GET(new Request("http://localhost/api/ingestions/ingestion-1"), {
      params: Promise.resolve({ id: "ingestion-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("PARTIAL");
    expect(body.totalRows).toBe(5);
    expect(body.hasExport).toBe(true);
    expect(body.schemaVersionNumber).toBe(2);
  });

  it("schemaVersionNumber à null si la version de schéma est introuvable", async () => {
    findIngestionById.mockResolvedValue(BASE_INGESTION);
    findSchemaVersionById.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/ingestions/ingestion-1"), {
      params: Promise.resolve({ id: "ingestion-1" }),
    });
    const body = await response.json();

    expect(body.schemaVersionNumber).toBeNull();
  });

  it("hasExport à false quand validFileKey est null", async () => {
    findIngestionById.mockResolvedValue({ ...BASE_INGESTION, validFileKey: null });

    const response = await GET(new Request("http://localhost/api/ingestions/ingestion-1"), {
      params: Promise.resolve({ id: "ingestion-1" }),
    });
    const body = await response.json();

    expect(body.hasExport).toBe(false);
  });

  it("utilise page=1 et pageSize=50 par défaut", async () => {
    findIngestionById.mockResolvedValue(BASE_INGESTION);

    await GET(new Request("http://localhost/api/ingestions/ingestion-1"), {
      params: Promise.resolve({ id: "ingestion-1" }),
    });

    expect(listIngestionErrorsPage).toHaveBeenCalledWith("ingestion-1", {
      page: 1,
      pageSize: 50,
    });
  });

  it("respecte page/pageSize passés en query string", async () => {
    findIngestionById.mockResolvedValue(BASE_INGESTION);

    await GET(new Request("http://localhost/api/ingestions/ingestion-1?page=3&pageSize=10"), {
      params: Promise.resolve({ id: "ingestion-1" }),
    });

    expect(listIngestionErrorsPage).toHaveBeenCalledWith("ingestion-1", {
      page: 3,
      pageSize: 10,
    });
  });

  it("plafonne pageSize à 200 même si une valeur plus grande est demandée", async () => {
    findIngestionById.mockResolvedValue(BASE_INGESTION);

    await GET(new Request("http://localhost/api/ingestions/ingestion-1?pageSize=9999"), {
      params: Promise.resolve({ id: "ingestion-1" }),
    });

    expect(listIngestionErrorsPage).toHaveBeenCalledWith("ingestion-1", {
      page: 1,
      pageSize: 200,
    });
  });

  it("ignore une valeur de page invalide (retombe sur 1)", async () => {
    findIngestionById.mockResolvedValue(BASE_INGESTION);

    await GET(new Request("http://localhost/api/ingestions/ingestion-1?page=abc"), {
      params: Promise.resolve({ id: "ingestion-1" }),
    });

    expect(listIngestionErrorsPage).toHaveBeenCalledWith("ingestion-1", {
      page: 1,
      pageSize: 50,
    });
  });

  it("calcule totalPages à partir de totalCount et pageSize", async () => {
    findIngestionById.mockResolvedValue(BASE_INGESTION);
    countIngestionErrors.mockResolvedValue(101);

    const response = await GET(
      new Request("http://localhost/api/ingestions/ingestion-1?pageSize=50"),
      { params: Promise.resolve({ id: "ingestion-1" }) },
    );
    const body = await response.json();

    expect(body.errors.totalCount).toBe(101);
    expect(body.errors.totalPages).toBe(3);
  });

  it("anomalies vide quand l'ingestion n'a aucune statistique de colonne", async () => {
    findIngestionById.mockResolvedValue(BASE_INGESTION);
    listIngestionColumnStats.mockResolvedValue([]);

    const response = await GET(new Request("http://localhost/api/ingestions/ingestion-1"), {
      params: Promise.resolve({ id: "ingestion-1" }),
    });
    const body = await response.json();

    expect(body.anomalies).toEqual([]);
    expect(getHistoricalColumnStatsSummary).not.toHaveBeenCalled();
  });

  it("détecte une anomalie quand la moyenne du fichier s'écarte fortement de l'historique", async () => {
    findIngestionById.mockResolvedValue(BASE_INGESTION);
    listIngestionColumnStats.mockResolvedValue([
      { id: "stat-1", ingestionId: "ingestion-1", columnName: "montant_fcfa", count: 3, mean: 2_400_000, min: 1, max: 1, stddev: 0, createdAt: new Date() },
    ]);
    getHistoricalColumnStatsSummary.mockResolvedValue([
      { columnName: "montant_fcfa", sampleCount: 10, avgMean: 25_000, stddevMean: 5_000 },
    ]);

    const response = await GET(new Request("http://localhost/api/ingestions/ingestion-1"), {
      params: Promise.resolve({ id: "ingestion-1" }),
    });
    const body = await response.json();

    expect(getHistoricalColumnStatsSummary).toHaveBeenCalledWith("source-1", "ingestion-1");
    expect(body.anomalies).toHaveLength(1);
    expect(body.anomalies[0]).toMatchObject({ columnName: "montant_fcfa", fileMean: 2_400_000 });
  });

  it("401 si non authentifié", async () => {
    const unauthenticatedResponse = new Response(null, { status: 401 });
    requireSession.mockResolvedValue({ session: null, response: unauthenticatedResponse });

    const response = await GET(new Request("http://localhost/api/ingestions/ingestion-1"), {
      params: Promise.resolve({ id: "ingestion-1" }),
    });

    expect(response.status).toBe(401);
    expect(findIngestionById).not.toHaveBeenCalled();
  });
});
