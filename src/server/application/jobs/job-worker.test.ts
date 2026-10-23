import { describe, expect, it } from "vitest";
import { PermanentJobError } from "../errors";
import { JobWorker } from "./job-worker";
import { signedInClient, testContainer } from "../../test-support";
import type { JobHandler } from "./ports";

async function setup(handler: JobHandler, maxRetries = 2) {
  const container = testContainer();
  const { userId } = await signedInClient(container);
  const worker = new JobWorker(container.jobs, { work: handler }, container.clock, {
    baseBackoffMs: 1000,
  });
  const job = await container.jobs.enqueue(
    { userId, type: "work", payload: {}, maxRetries },
    container.clock().toISOString(),
  );
  const reload = async () => {
    const found = await container.jobs.findForUser(userId, job.id);
    if (!found) throw new Error("job vanished");
    return found;
  };
  return { container, worker, reload };
}

describe("JobWorker", () => {
  it("completes a job with the handler's result and full progress", async () => {
    const { worker, reload } = await setup(async (_job, ctx) => {
      await ctx.reportProgress(0.5);
      return { imported: 3 };
    });
    await worker.runOnce();
    expect(await reload()).toMatchObject({
      status: "completed",
      result: { imported: 3 },
      progress: 1,
    });
  });

  it("retries a transient failure after an exponential backoff", async () => {
    let calls = 0;
    const { container, worker, reload } = await setup(async () => {
      calls += 1;
      if (calls < 3) throw new Error("provider timeout");
      return "ok";
    });
    await worker.runOnce();
    expect(await reload()).toMatchObject({ status: "retrying", retryCount: 1 });
    expect(await worker.runOnce()).toBe(false); // not due yet
    container.setNow("2026-03-15T12:00:01Z"); // 1s backoff
    await worker.runOnce();
    expect(await reload()).toMatchObject({ status: "retrying", retryCount: 2 });
    container.setNow("2026-03-15T12:00:03Z"); // then 2s
    await worker.runOnce();
    expect(await reload()).toMatchObject({ status: "completed" });
  });

  it("fails for good once retries are used up, keeping the last error", async () => {
    const { container, worker, reload } = await setup(async () => {
      throw new Error("still down");
    }, 1);
    await worker.runOnce();
    container.setNow("2026-03-15T13:00:00Z");
    await worker.runOnce();
    expect(await reload()).toMatchObject({ status: "failed", error: "still down" });
  });

  it("does not retry a permanent failure", async () => {
    const { worker, reload } = await setup(async () => {
      throw new PermanentJobError("Unrecognised file");
    });
    await worker.runOnce();
    expect(await reload()).toMatchObject({ status: "failed", retryCount: 0 });
  });

  it("fails a job whose type has no handler instead of leaving it running", async () => {
    const container = testContainer();
    const { userId } = await signedInClient(container);
    const worker = new JobWorker(container.jobs, {}, container.clock);
    const job = await container.jobs.enqueue(
      { userId, type: "mystery", payload: {} },
      container.clock().toISOString(),
    );
    await worker.drain();
    expect(await container.jobs.findForUser(userId, job.id)).toMatchObject({ status: "failed" });
  });

  it("fails a job that keeps crashing the process instead of requeueing it forever", async () => {
    const { container, worker, reload } = await setup(async () => "done", 1);
    for (let restart = 0; restart < 2; restart += 1) {
      await container.jobs.claimNext(container.clock().toISOString());
      await worker.start();
      worker.stop();
    }
    expect(await reload()).toMatchObject({ status: "failed", retryCount: 2 });
  });

  it("requeues jobs a crash left running", async () => {
    const { container, worker, reload } = await setup(async () => "done");
    await container.jobs.claimNext(container.clock().toISOString());
    expect((await reload()).status).toBe("running");
    await worker.start();
    worker.stop();
    expect((await reload()).status).toBe("queued");
  });
});
