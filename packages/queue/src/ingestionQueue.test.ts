import type { Queue } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import { enqueueIngestionJob, type IngestionJobPayload } from "./ingestionQueue";

describe("enqueueIngestionJob", () => {
  it("utilise ingestionId comme jobId et configure retries + backoff exponentiel", async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const fakeQueue = { add } as unknown as Queue<IngestionJobPayload>;

    await enqueueIngestionJob(fakeQueue, "ingestion-123");

    expect(add).toHaveBeenCalledWith(
      "process-ingestion",
      { ingestionId: "ingestion-123" },
      {
        jobId: "ingestion-123",
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      },
    );
  });
});
