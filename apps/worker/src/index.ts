import {
  INGESTION_QUEUE_NAME,
  createRedisConnection,
  type IngestionJobPayload,
} from "@dataflow-ci/queue";
import { Worker, type Job } from "bullmq";
import { env } from "./env";
import { handleJobFailure } from "./handleJobFailure";
import { startHealthcheckServer } from "./healthcheck";
import { logger } from "./logger";
import { processIngestionJob } from "./processIngestionJob";

const HEALTHCHECK_PORT = Number(process.env.HEALTHCHECK_PORT) || 3001;
// Au-delà de cette durée, on considère le job bloqué plutôt que de le laisser
// tourner indéfiniment (ex. stockage qui ne répond jamais) — voir "timeout"
// dans les cas gérés (TASKS.md / DECISIONS.md).
const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`Timeout: ${label} a dépassé ${timeoutMs}ms.`)), timeoutMs);
    }),
  ]);
}

function main(): void {
  const connection = createRedisConnection({ redisUrl: env.REDIS_URL });

  connection.on("error", (error) => {
    // Panne Redis : ioredis retente la connexion tout seul (comportement par
    // défaut) — on se contente de logger, pas de crasher le process.
    logger.error({ step: "redis", error: error.message }, "Erreur de connexion Redis.");
  });
  connection.on("reconnecting", () => {
    logger.warn({ step: "redis" }, "Reconnexion à Redis en cours...");
  });
  connection.on("ready", () => {
    logger.info({ step: "redis" }, "Connecté à Redis.");
  });

  const worker = new Worker<IngestionJobPayload>(
    INGESTION_QUEUE_NAME,
    async (job: Job<IngestionJobPayload>) => {
      const jobId = job.id ?? job.data.ingestionId;
      await withTimeout(
        processIngestionJob({ ingestionId: job.data.ingestionId, jobId }),
        PROCESSING_TIMEOUT_MS,
        `traitement de l'ingestion ${job.data.ingestionId}`,
      );
    },
    { connection, concurrency: 1 },
  );

  worker.on("failed", (job: Job<IngestionJobPayload> | undefined, error: Error) => {
    if (!job) return;
    void handleJobFailure(
      {
        ingestionId: job.data.ingestionId,
        jobId: job.id ?? job.data.ingestionId,
        attemptsMade: job.attemptsMade,
        maxAttempts: job.opts.attempts ?? 1,
      },
      error,
    );
  });

  worker.on("completed", (job: Job<IngestionJobPayload>) => {
    logger.info(
      { step: "job_completed", ingestionId: job.data.ingestionId, jobId: job.id },
      "Job terminé avec succès.",
    );
  });

  const healthServer = startHealthcheckServer(connection, HEALTHCHECK_PORT);

  logger.info(
    { step: "boot", nodeEnv: env.NODE_ENV, healthcheckPort: HEALTHCHECK_PORT },
    "Worker démarré, en attente de jobs.",
  );

  let shuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ step: "shutdown", signal }, "Arrêt demandé, fin des jobs en cours...");
    // worker.close() attend la fin des jobs actifs avant de rendre la main —
    // pas d'interruption brutale d'un traitement en plein milieu.
    await worker.close();
    healthServer.close();
    await connection.quit();
    logger.info({ step: "shutdown", signal }, "Arrêt propre terminé.");
    process.exit(0);
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main();
