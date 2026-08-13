import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findIngestionById = vi.fn();
const claimIngestionForProcessing = vi.fn();
const deleteIngestionErrors = vi.fn();
const appendIngestionErrors = vi.fn();
const replaceIngestionColumnStats = vi.fn();
const completeIngestion = vi.fn();
const findSchemaVersionById = vi.fn();
const getTypedDefinition = vi.fn();

vi.mock("@dataflow-ci/database", () => ({
  ingestionRepository: {
    findIngestionById: (...args: unknown[]) => findIngestionById(...args),
    claimIngestionForProcessing: (...args: unknown[]) => claimIngestionForProcessing(...args),
    deleteIngestionErrors: (...args: unknown[]) => deleteIngestionErrors(...args),
    appendIngestionErrors: (...args: unknown[]) => appendIngestionErrors(...args),
    replaceIngestionColumnStats: (...args: unknown[]) => replaceIngestionColumnStats(...args),
    completeIngestion: (...args: unknown[]) => completeIngestion(...args),
  },
  schemaVersionRepository: {
    findSchemaVersionById: (...args: unknown[]) => findSchemaVersionById(...args),
    getTypedDefinition: (...args: unknown[]) => getTypedDefinition(...args),
  },
}));

const download = vi.fn();
const upload = vi.fn();
vi.mock("./storage", () => ({
  getStorageProvider: () => ({
    download: (...args: unknown[]) => download(...args),
    upload: (...args: unknown[]) => upload(...args),
  }),
}));

const validateFile = vi.fn();
vi.mock("@dataflow-ci/validation", () => ({
  validateFile: (...args: unknown[]) => validateFile(...args),
}));

const notifyIngestionWebhook = vi.fn();
vi.mock("./dispatchWebhook", () => ({
  notifyIngestionWebhook: (...args: unknown[]) => notifyIngestionWebhook(...args),
}));

const { processIngestionJob } = await import("./processIngestionJob");

const BASE_INGESTION = {
  id: "ingestion-1",
  dataSourceId: "source-1",
  schemaVersionId: "schema-version-1",
  originalFileKey: "sources/source-1/uploads/file.csv",
  originalFilename: "file.csv",
};

const SUCCESS_RESULT = {
  totalRows: 2,
  validRows: 2,
  invalidRows: 0,
  errors: [],
  validRowsCsv: Readable.from(["date,region\n2026-01-01,Abidjan\n"]),
  columnStats: [{ columnName: "montant_fcfa", count: 2, mean: 15000, min: 10000, max: 20000, stddev: 5000 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  deleteIngestionErrors.mockResolvedValue(undefined);
  download.mockResolvedValue(Buffer.from("date,region\n2026-01-01,Abidjan\n"));
  upload.mockResolvedValue(undefined);
  appendIngestionErrors.mockResolvedValue(0);
  replaceIngestionColumnStats.mockResolvedValue(undefined);
  completeIngestion.mockResolvedValue({ id: "ingestion-1", dataSourceId: "source-1" });
  notifyIngestionWebhook.mockResolvedValue(undefined);
  findSchemaVersionById.mockResolvedValue({ id: "schema-version-1", definition: {} });
  getTypedDefinition.mockReturnValue({
    columns: [],
    allowExtraColumns: true,
    trimStrings: true,
    caseSensitiveHeaders: false,
  });
  validateFile.mockResolvedValue({
    ...SUCCESS_RESULT,
    validRowsCsv: Readable.from(["date,region\n2026-01-01,Abidjan\n"]),
  });
});

describe("processIngestionJob", () => {
  it("abandonne sans erreur si l'ingestion est introuvable", async () => {
    findIngestionById.mockResolvedValue(null);

    await expect(
      processIngestionJob({ ingestionId: "unknown", jobId: "unknown" }),
    ).resolves.toBeUndefined();

    expect(claimIngestionForProcessing).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it.each(["SUCCESS", "PARTIAL", "FAILED"])(
    "ignore une ingestion déjà terminée (%s) — pas de retraitement",
    async (status) => {
      findIngestionById.mockResolvedValue({ ...BASE_INGESTION, status });

      await processIngestionJob({ ingestionId: "ingestion-1", jobId: "job-1" });

      expect(claimIngestionForProcessing).not.toHaveBeenCalled();
      expect(download).not.toHaveBeenCalled();
      expect(completeIngestion).not.toHaveBeenCalled();
    },
  );

  it("ignore le job si la tentative de verrouillage échoue (course perdue)", async () => {
    findIngestionById.mockResolvedValue({ ...BASE_INGESTION, status: "PENDING" });
    claimIngestionForProcessing.mockResolvedValue(false);

    await processIngestionJob({ ingestionId: "ingestion-1", jobId: "job-1" });

    expect(download).not.toHaveBeenCalled();
    expect(completeIngestion).not.toHaveBeenCalled();
  });

  it("traite normalement une ingestion PENDING verrouillée avec succès", async () => {
    findIngestionById.mockResolvedValue({ ...BASE_INGESTION, status: "PENDING" });
    claimIngestionForProcessing.mockResolvedValue(true);

    await processIngestionJob({ ingestionId: "ingestion-1", jobId: "job-1" });

    expect(claimIngestionForProcessing).toHaveBeenCalledWith("ingestion-1");
    expect(deleteIngestionErrors).toHaveBeenCalledWith("ingestion-1");
    expect(download).toHaveBeenCalledWith(BASE_INGESTION.originalFileKey);
    expect(validateFile).toHaveBeenCalledWith(expect.objectContaining({ fileFormat: "csv" }));
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({ contentType: "text/csv" }));
    expect(appendIngestionErrors).toHaveBeenCalledWith("ingestion-1", []);
    expect(replaceIngestionColumnStats).toHaveBeenCalledWith(
      "ingestion-1",
      SUCCESS_RESULT.columnStats,
    );
    expect(completeIngestion).toHaveBeenCalledWith(
      "ingestion-1",
      expect.objectContaining({
        status: "SUCCESS",
        totalRows: 2,
        validRows: 2,
        invalidRows: 0,
        validFileKey: expect.any(String),
      }),
    );
    expect(notifyIngestionWebhook).toHaveBeenCalledWith(
      { id: "ingestion-1", dataSourceId: "source-1" },
      expect.anything(),
    );
  });

  it("reprend une ingestion déjà PROCESSING (retry) sans re-tenter le verrouillage", async () => {
    findIngestionById.mockResolvedValue({ ...BASE_INGESTION, status: "PROCESSING" });

    await processIngestionJob({ ingestionId: "ingestion-1", jobId: "job-1" });

    expect(claimIngestionForProcessing).not.toHaveBeenCalled();
    expect(download).toHaveBeenCalledTimes(1);
    expect(completeIngestion).toHaveBeenCalledTimes(1);
  });

  it("supprime les erreurs existantes avant de retraiter (idempotence des retries)", async () => {
    findIngestionById.mockResolvedValue({ ...BASE_INGESTION, status: "PROCESSING" });

    await processIngestionJob({ ingestionId: "ingestion-1", jobId: "job-1" });

    expect(deleteIngestionErrors).toHaveBeenCalledWith("ingestion-1");
  });

  it("propage l'erreur de téléchargement sans écrire FAILED elle-même (laisse BullMQ retenter)", async () => {
    findIngestionById.mockResolvedValue({ ...BASE_INGESTION, status: "PENDING" });
    claimIngestionForProcessing.mockResolvedValue(true);
    download.mockRejectedValue(new Error("Storage unavailable"));

    await expect(
      processIngestionJob({ ingestionId: "ingestion-1", jobId: "job-1" }),
    ).rejects.toThrow("Storage unavailable");

    expect(completeIngestion).not.toHaveBeenCalled();
  });

  it("n'uploade pas d'export et écrit FAILED quand aucune ligne n'est valide", async () => {
    findIngestionById.mockResolvedValue({ ...BASE_INGESTION, status: "PENDING" });
    claimIngestionForProcessing.mockResolvedValue(true);
    validateFile.mockResolvedValue({
      totalRows: 3,
      validRows: 0,
      invalidRows: 3,
      errors: [
        {
          rowNumber: 1,
          columnName: "montant_fcfa",
          errorCode: "INVALID_INTEGER",
          message: '"abc" n\'est pas un entier valide.',
          rawValue: "abc",
        },
      ],
      validRowsCsv: Readable.from([""]),
      columnStats: [],
    });

    await processIngestionJob({ ingestionId: "ingestion-1", jobId: "job-1" });

    expect(upload).not.toHaveBeenCalled();
    expect(appendIngestionErrors).toHaveBeenCalledWith(
      "ingestion-1",
      expect.arrayContaining([expect.objectContaining({ errorCode: "INVALID_INTEGER" })]),
    );
    expect(completeIngestion).toHaveBeenCalledWith(
      "ingestion-1",
      expect.objectContaining({ status: "FAILED", validRows: 0 }),
    );
    const completeArgs = completeIngestion.mock.calls[0]?.[1];
    expect(completeArgs).not.toHaveProperty("validFileKey");
    expect(notifyIngestionWebhook).toHaveBeenCalledTimes(1);
  });

  it("écrit PARTIAL quand le fichier mélange lignes valides et invalides", async () => {
    findIngestionById.mockResolvedValue({ ...BASE_INGESTION, status: "PENDING" });
    claimIngestionForProcessing.mockResolvedValue(true);
    validateFile.mockResolvedValue({
      totalRows: 3,
      validRows: 2,
      invalidRows: 1,
      errors: [
        {
          rowNumber: 3,
          columnName: "montant_fcfa",
          errorCode: "INVALID_INTEGER",
          message: '"abc" n\'est pas un entier valide.',
          rawValue: "abc",
        },
      ],
      validRowsCsv: Readable.from(["date,region\n2026-01-01,Abidjan\n"]),
      columnStats: [],
    });

    await processIngestionJob({ ingestionId: "ingestion-1", jobId: "job-1" });

    expect(upload).toHaveBeenCalledTimes(1);
    expect(completeIngestion).toHaveBeenCalledWith(
      "ingestion-1",
      expect.objectContaining({ status: "PARTIAL", validRows: 2, invalidRows: 1 }),
    );
  });

  it("lève si la version de schéma référencée est introuvable", async () => {
    findIngestionById.mockResolvedValue({ ...BASE_INGESTION, status: "PENDING" });
    claimIngestionForProcessing.mockResolvedValue(true);
    findSchemaVersionById.mockResolvedValue(null);

    await expect(
      processIngestionJob({ ingestionId: "ingestion-1", jobId: "job-1" }),
    ).rejects.toThrow(/Version de schéma introuvable/);

    expect(validateFile).not.toHaveBeenCalled();
    expect(completeIngestion).not.toHaveBeenCalled();
  });
});
