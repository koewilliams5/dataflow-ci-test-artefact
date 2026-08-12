import {
  createIngestionQueue,
  createRedisConnection,
  enqueueIngestionJob as enqueue,
  type IngestionJobPayload,
} from "@dataflow-ci/queue";
import type { Queue } from "bullmq";
import { env } from "../env";

declare global {
  var __ingestionQueue: Queue<IngestionJobPayload> | undefined;
}

function getIngestionQueue(): Queue<IngestionJobPayload> {
  globalThis.__ingestionQueue ??= createIngestionQueue(
    createRedisConnection({ redisUrl: env.REDIS_URL }),
  );
  return globalThis.__ingestionQueue;
}

export async function enqueueIngestionJob(ingestionId: string): Promise<void> {
  await enqueue(getIngestionQueue(), ingestionId);
}
