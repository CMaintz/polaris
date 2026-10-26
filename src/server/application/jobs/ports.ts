export type JobStatus = "queued" | "running" | "completed" | "failed" | "retrying";

export interface Job {
  id: string;
  userId: string;
  type: string;
  status: JobStatus;
  payload: Record<string, unknown>;
  result: unknown;
  /** Fraction complete, 0 to 1. */
  progress: number;
  error: string | null;
  retryCount: number;
  maxRetries: number;
  runAfter: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface NewJob {
  userId: string;
  type: string;
  payload: Record<string, unknown>;
  maxRetries?: number;
}

export interface JobRepository {
  enqueue(job: NewJob, now: string): Promise<Job>;
  /** Atomically marks the oldest due job as running and returns it. */
  claimNext(now: string): Promise<Job | null>;
  setProgress(id: string, progress: number): Promise<void>;
  complete(id: string, result: unknown, now: string): Promise<void>;
  scheduleRetry(id: string, error: string, runAfter: string): Promise<void>;
  fail(id: string, error: string, now: string): Promise<void>;
  /**
   * Jobs left running by a crash. Requeued (handlers are idempotent) but counted as a
   * retry, so a job that crashes the process fails once its retries run out.
   */
  requeueInterrupted(now: string): Promise<void>;
  findForUser(userId: string, id: string): Promise<Job | null>;
  listForUser(userId: string, type?: string, limit?: number): Promise<Job[]>;
}

export interface JobContext {
  reportProgress(progress: number): Promise<void>;
}

export type JobHandler = (job: Job, context: JobContext) => Promise<unknown>;
