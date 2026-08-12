import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findDataSourceById = vi.fn();
const findActiveIngestionByChecksum = vi.fn();
const createIngestion = vi.fn();

vi.mock("@dataflow-ci/database", () => ({
  dataSourceRepository: {
    findDataSourceById: (...args: unknown[]) => findDataSourceById(...args),
  },
  ingestionRepository: {
    findActiveIngestionByChecksum: (...args: unknown[]) => findActiveIngestionByChecksum(...args),
    createIngestion: (...args: unknown[]) => createIngestion(...args),
  },
}));

const requireSession = vi.fn();
vi.mock("../../../lib/api/requireSession", () => ({
  requireSession: () => requireSession(),
}));

const enqueueIngestionJob = vi.fn();
vi.mock("../../../lib/queue", () => ({
  enqueueIngestionJob: (...args: unknown[]) => enqueueIngestionJob(...args),
}));

const upload = vi.fn();
vi.mock("../../../lib/storage", () => ({
  getStorageProvider: () => ({ upload: (...args: unknown[]) => upload(...args) }),
}));

const { POST } = await import("./route");

const AUTHENTICATED = { session: { user: { id: "user-1" } }, response: null };
const UNAUTHENTICATED = {
  session: null,
  response: NextResponse.json({ error: { message: "Authentification requise." } }, { status: 401 }),
};
const ACTIVE_SOURCE = { id: "source-1", currentSchemaVersionId: "version-1" };

function makeCsvFile(
  name = "ventes.csv",
  content = "date,region,montant\n2026-01-01,Abidjan,1000\n",
) {
  return new File([content], name, { type: "text/csv" });
}

function makeUploadRequest(options: { dataSourceId?: string; file?: File } = {}) {
  const formData = new FormData();
  if (options.dataSourceId !== undefined) {
    formData.append("dataSourceId", options.dataSourceId);
  }
  if (options.file !== undefined) {
    formData.append("file", options.file);
  }
  return new Request("http://localhost/api/ingestions", { method: "POST", body: formData });
}

beforeEach(() => {
  vi.clearAllMocks();
  findDataSourceById.mockResolvedValue(ACTIVE_SOURCE);
  findActiveIngestionByChecksum.mockResolvedValue(null);
  createIngestion.mockResolvedValue({ id: "ingestion-1" });
  upload.mockResolvedValue(undefined);
  enqueueIngestionJob.mockResolvedValue(undefined);
});

describe("POST /api/ingestions", () => {
  it("401 si non authentifié", async () => {
    requireSession.mockResolvedValue(UNAUTHENTICATED);

    const response = await POST(
      makeUploadRequest({ dataSourceId: "source-1", file: makeCsvFile() }),
    );

    expect(response.status).toBe(401);
    expect(upload).not.toHaveBeenCalled();
  });

  it("400 si dataSourceId est manquant", async () => {
    requireSession.mockResolvedValue(AUTHENTICATED);

    const response = await POST(makeUploadRequest({ file: makeCsvFile() }));

    expect(response.status).toBe(400);
  });

  it("404 si la source n'existe pas", async () => {
    requireSession.mockResolvedValue(AUTHENTICATED);
    findDataSourceById.mockResolvedValue(null);

    const response = await POST(
      makeUploadRequest({ dataSourceId: "unknown", file: makeCsvFile() }),
    );

    expect(response.status).toBe(404);
  });

  it("400 si la source n'a pas encore de schéma actif", async () => {
    requireSession.mockResolvedValue(AUTHENTICATED);
    findDataSourceById.mockResolvedValue({ id: "source-1", currentSchemaVersionId: null });

    const response = await POST(
      makeUploadRequest({ dataSourceId: "source-1", file: makeCsvFile() }),
    );

    expect(response.status).toBe(400);
  });

  it("400 si aucun fichier n'est fourni", async () => {
    requireSession.mockResolvedValue(AUTHENTICATED);

    const response = await POST(makeUploadRequest({ dataSourceId: "source-1" }));

    expect(response.status).toBe(400);
  });

  it("400 si le fichier est vide", async () => {
    requireSession.mockResolvedValue(AUTHENTICATED);

    const response = await POST(
      makeUploadRequest({
        dataSourceId: "source-1",
        file: new File([], "vide.csv", { type: "text/csv" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });

  it("400 si le fichier dépasse 10 Mo", async () => {
    requireSession.mockResolvedValue(AUTHENTICATED);
    const oversized = "a".repeat(11 * 1024 * 1024);

    const response = await POST(
      makeUploadRequest({ dataSourceId: "source-1", file: makeCsvFile("gros.csv", oversized) }),
    );

    expect(response.status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });

  it("413 si Content-Length dépasse la taille maximale, sans lire le corps de la requête", async () => {
    requireSession.mockResolvedValue(AUTHENTICATED);
    const request = new Request("http://localhost/api/ingestions", {
      method: "POST",
      headers: { "content-length": String(50 * 1024 * 1024) },
      body: new FormData(),
    });

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(upload).not.toHaveBeenCalled();
  });

  it("400 si l'extension est interdite", async () => {
    requireSession.mockResolvedValue(AUTHENTICATED);

    const response = await POST(
      makeUploadRequest({ dataSourceId: "source-1", file: makeCsvFile("script.exe", "MZ") }),
    );

    expect(response.status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });

  it("parcours complet : upload -> stockage -> ingestion PENDING -> job créé", async () => {
    requireSession.mockResolvedValue(AUTHENTICATED);

    const response = await POST(
      makeUploadRequest({ dataSourceId: "source-1", file: makeCsvFile() }),
    );

    expect(response.status).toBe(201);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(createIngestion).toHaveBeenCalledTimes(1);
    expect(createIngestion).toHaveBeenCalledWith(
      expect.objectContaining({
        dataSourceId: "source-1",
        schemaVersionId: "version-1",
        createdById: "user-1",
        originalFilename: "ventes.csv",
      }),
    );
    expect(enqueueIngestionJob).toHaveBeenCalledWith("ingestion-1");

    const body = (await response.json()) as { ingestionId: string };
    expect(body.ingestionId).toBe("ingestion-1");
  });

  it("double soumission : renvoie l'ingestion existante sans re-uploader ni recréer", async () => {
    requireSession.mockResolvedValue(AUTHENTICATED);
    findActiveIngestionByChecksum.mockResolvedValue({ id: "existing-ingestion" });

    const response = await POST(
      makeUploadRequest({ dataSourceId: "source-1", file: makeCsvFile() }),
    );

    expect(response.status).toBe(200);
    expect(upload).not.toHaveBeenCalled();
    expect(createIngestion).not.toHaveBeenCalled();
    expect(enqueueIngestionJob).not.toHaveBeenCalled();

    const body = (await response.json()) as { ingestionId: string };
    expect(body.ingestionId).toBe("existing-ingestion");
  });
});
