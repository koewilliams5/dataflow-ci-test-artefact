import { beforeEach, describe, expect, it, vi } from "vitest";

const completeIngestion = vi.fn();

vi.mock("@dataflow-ci/database", () => ({
  ingestionRepository: {
    completeIngestion: (...args: unknown[]) => completeIngestion(...args),
  },
}));

const notifyIngestionWebhook = vi.fn();
vi.mock("./dispatchWebhook", () => ({
  notifyIngestionWebhook: (...args: unknown[]) => notifyIngestionWebhook(...args),
}));

const { handleJobFailure } = await import("./handleJobFailure");

const COMPLETED_INGESTION = { id: "ingestion-1", dataSourceId: "source-1", status: "FAILED" };

beforeEach(() => {
  vi.clearAllMocks();
  completeIngestion.mockResolvedValue(COMPLETED_INGESTION);
  notifyIngestionWebhook.mockResolvedValue(undefined);
});

describe("handleJobFailure", () => {
  it("n'écrit rien tant que toutes les tentatives ne sont pas épuisées", async () => {
    await handleJobFailure(
      { ingestionId: "ingestion-1", jobId: "job-1", attemptsMade: 1, maxAttempts: 3 },
      new Error("Timeout"),
    );

    expect(completeIngestion).not.toHaveBeenCalled();
    expect(notifyIngestionWebhook).not.toHaveBeenCalled();
  });

  it("marque l'ingestion FAILED une fois la dernière tentative épuisée", async () => {
    await handleJobFailure(
      { ingestionId: "ingestion-1", jobId: "job-1", attemptsMade: 3, maxAttempts: 3 },
      new Error("Storage unavailable"),
    );

    expect(completeIngestion).toHaveBeenCalledWith("ingestion-1", {
      status: "FAILED",
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      failureReason: "Storage unavailable",
    });
    expect(notifyIngestionWebhook).toHaveBeenCalledWith(COMPLETED_INGESTION, expect.anything());
  });

  it("ne lève pas si l'écriture finale en base échoue elle-même", async () => {
    completeIngestion.mockRejectedValue(new Error("DB down"));

    await expect(
      handleJobFailure(
        { ingestionId: "ingestion-1", jobId: "job-1", attemptsMade: 3, maxAttempts: 3 },
        new Error("Storage unavailable"),
      ),
    ).resolves.toBeUndefined();
    expect(notifyIngestionWebhook).not.toHaveBeenCalled();
  });
});
