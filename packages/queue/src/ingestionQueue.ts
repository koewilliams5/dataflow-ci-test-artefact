import { Queue } from "bullmq";
import type IORedis from "ioredis";

export const INGESTION_QUEUE_NAME = "ingestion";
export const INGESTION_JOB_NAME = "process-ingestion";

export interface IngestionJobPayload {
  ingestionId: string;
}

// 3 tentatives, backoff exponentiel (5s, 10s, 20s) — assez pour absorber une
// panne transitoire de Redis/stockage sans retenter indéfiniment un fichier
// dont le contenu est réellement en cause (ça, c'est au moteur de validation
// de le déterminer, pas à la queue).
export const INGESTION_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
} as const;

export function createIngestionQueue(connection: IORedis): Queue<IngestionJobPayload> {
  return new Queue<IngestionJobPayload>(INGESTION_QUEUE_NAME, { connection });
}

/**
 * `jobId: ingestionId` (pas un ID généré par BullMQ) : un deuxième appel avec
 * le même ingestionId ne crée pas un second job — BullMQ déduplique par jobId.
 * C'est la base de l'idempotence du traitement asynchrone (voir apps/worker
 * pour l'explication complète des race conditions évitées).
 */
export async function enqueueIngestionJob(
  queue: Queue<IngestionJobPayload>,
  ingestionId: string,
): Promise<void> {
  await queue.add(
    INGESTION_JOB_NAME,
    { ingestionId },
    { jobId: ingestionId, ...INGESTION_JOB_OPTIONS },
  );
}
