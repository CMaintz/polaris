import { type Clock, nowIso } from "../clock";
import { PermanentJobError } from "../errors";
import type { Job, JobHandler, JobRepository } from "./ports";

export interface WorkerOptions {
  pollMs: number;
  baseBackoffMs: number;
  onError?: (job: Job, error: unknown) => void;
}

const DEFAULTS: WorkerOptions = { pollMs: 1000, baseBackoffMs: 5000 };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const canRetry = (job: Job) => job.retryCount < job.maxRetries;

export class JobWorker {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private readonly options: WorkerOptions;

  constructor(
    private readonly jobs: JobRepository,
    private readonly handlers: Record<string, JobHandler>,
    private readonly clock: Clock,
    options: Partial<WorkerOptions> = {},
  ) {
    this.options = { ...DEFAULTS, ...options };
  }

  async start(): Promise<void> {
    await this.recoverInterrupted();
    this.timer = setInterval(() => void this.drain(), this.options.pollMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Overlapping calls are ignored, so a slow drain never hands the same job out twice. */
  async drain(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      while (await this.runOnce());
    } finally {
      this.busy = false;
    }
  }

  async runOnce(): Promise<boolean> {
    const job = await this.jobs.claimNext(nowIso(this.clock));
    if (!job) return false;
    const handler = this.handlers[job.type];
    if (!handler) {
      await this.jobs.fail(job.id, `No handler for job type "${job.type}"`, nowIso(this.clock));
      return true;
    }
    try {
      const result = await handler(job, {
        reportProgress: (progress) => this.jobs.setProgress(job.id, progress),
      });
      await this.jobs.complete(job.id, result, nowIso(this.clock));
    } catch (error) {
      this.options.onError?.(job, error);
      await this.handleFailure(job, error);
    }
    return true;
  }

  /**
   * Handlers are idempotent, so a run a crash cut short is safe to repeat. It still counts
   * as a try, so a job that crashes the process fails once its retries run out.
   */
  private async recoverInterrupted(): Promise<void> {
    const now = nowIso(this.clock);
    for (const job of await this.jobs.listRunning()) {
      const outcome = canRetry(job) ? "queued" : "failed";
      await this.jobs.recordInterruption(job.id, outcome, "Interrupted by a server restart", now);
    }
  }

  private async handleFailure(job: Job, error: unknown): Promise<void> {
    const message = messageOf(error);
    const retryable = !(error instanceof PermanentJobError) && canRetry(job);
    if (!retryable) {
      await this.jobs.fail(job.id, message, nowIso(this.clock));
      return;
    }
    const delay = this.options.baseBackoffMs * 2 ** job.retryCount;
    const runAfter = new Date(this.clock().getTime() + delay).toISOString();
    await this.jobs.scheduleRetry(job.id, message, runAfter);
  }
}
