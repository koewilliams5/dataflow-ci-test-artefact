import { ingestionRepository } from "@dataflow-ci/database";
import { notifyIngestionWebhook } from "./dispatchWebhook";
import { logger } from "./logger";

export interface FailedJobInfo {
  ingestionId: string;
  jobId: string;
  attemptsMade: number;
  maxAttempts: number;
}

/**
 * Appelé sur CHAQUE tentative échouée (BullMQ émet `failed` à chaque essai,
 * pas seulement au dernier). On n'écrit le statut FAILED en base que lorsque
 * `attemptsMade` a atteint le maximum configuré — avant ça, BullMQ va
 * retenter (backoff exponentiel), et écrire FAILED prématurément marquerait
 * l'ingestion à tort sur une panne transitoire.
 */
export async function handleJobFailure(job: FailedJobInfo, error: Error): Promise<void> {
  const log = logger.child({ ingestionId: job.ingestionId, jobId: job.jobId });

  log.error(
    {
      step: "job_failed",
      attemptsMade: job.attemptsMade,
      maxAttempts: job.maxAttempts,
      error: error.message,
    },
    "Tentative en échec.",
  );

  if (job.attemptsMade < job.maxAttempts) {
    log.warn({ step: "job_failed", result: "will_retry" }, "Nouvelle tentative à venir.");
    return;
  }

  try {
    const completed = await ingestionRepository.completeIngestion(job.ingestionId, {
      status: "FAILED",
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      failureReason: error.message,
    });
    log.error(
      { step: "job_failed", result: "final_failure" },
      "Toutes les tentatives épuisées — ingestion marquée FAILED.",
    );
    await notifyIngestionWebhook(completed, log);
  } catch (persistError) {
    log.error(
      {
        step: "persist_failure",
        error: persistError instanceof Error ? persistError.message : String(persistError),
      },
      "Impossible d'enregistrer l'échec final de l'ingestion.",
    );
  }
}
