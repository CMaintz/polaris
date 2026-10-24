import { randomUUID } from "node:crypto";
import type { Job, JobRepository, JobStatus, NewJob } from "../../application/jobs/ports";
import { type Db, fromJson, toJson } from "./database";

interface JobRow {
  id: string;
  user_id: string;
  type: string;
  status: JobStatus;
  payload: string;
  result: string | null;
  progress: number;
  error: string | null;
  retry_count: number;
  max_retries: number;
  run_after: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

function toJob(row: JobRow): Job {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    status: row.status,
    payload: fromJson<Record<string, unknown>>(row.payload) ?? {},
    result: fromJson(row.result),
    progress: row.progress,
    error: row.error,
    retryCount: row.retry_count,
    maxRetries: row.max_retries,
    runAfter: row.run_after,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

export class SqliteJobRepository implements JobRepository {
  constructor(private readonly db: Db) {}

  async enqueue(job: NewJob, now: string): Promise<Job> {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO jobs (id, user_id, type, status, payload, max_retries, run_after, created_at)
         VALUES (?, ?, ?, 'queued', ?, ?, ?, ?)`,
      )
      .run(id, job.userId, job.type, toJson(job.payload), job.maxRetries ?? 3, now, now);
    return this.get(id);
  }

  async claimNext(now: string): Promise<Job | null> {
    // UPDATE ... RETURNING in one statement, so two workers can never claim the same job.
    const row = this.db
      .prepare(
        `UPDATE jobs SET status = 'running', started_at = ?
         WHERE id = (SELECT id FROM jobs
                     WHERE status IN ('queued', 'retrying') AND run_after <= ?
                     ORDER BY run_after, created_at LIMIT 1)
         RETURNING *`,
      )
      .get(now, now) as JobRow | undefined;
    return row ? toJob(row) : null;
  }

  async setProgress(id: string, progress: number): Promise<void> {
    const clamped = Math.min(1, Math.max(0, progress));
    this.db.prepare("UPDATE jobs SET progress = ? WHERE id = ?").run(clamped, id);
  }

  async complete(id: string, result: unknown, now: string): Promise<void> {
    this.db
      .prepare(
        `UPDATE jobs SET status = 'completed', result = ?, progress = 1, error = NULL,
         completed_at = ? WHERE id = ?`,
      )
      .run(toJson(result), now, id);
  }

  async scheduleRetry(id: string, error: string, runAfter: string): Promise<void> {
    this.db
      .prepare(
        `UPDATE jobs SET status = 'retrying', error = ?, retry_count = retry_count + 1,
         run_after = ? WHERE id = ?`,
      )
      .run(error, runAfter, id);
  }

  async fail(id: string, error: string, now: string): Promise<void> {
    this.db
      .prepare("UPDATE jobs SET status = 'failed', error = ?, completed_at = ? WHERE id = ?")
      .run(error, now, id);
  }

  async listRunning(): Promise<Job[]> {
    const rows = this.db.prepare("SELECT * FROM jobs WHERE status = 'running'").all() as JobRow[];
    return rows.map(toJob);
  }

  async recordInterruption(
    id: string,
    outcome: "queued" | "failed",
    error: string,
    now: string,
  ): Promise<void> {
    this.db
      .prepare(
        `UPDATE jobs SET retry_count = retry_count + 1, status = ?, error = ?, run_after = ?,
           completed_at = ? WHERE id = ?`,
      )
      .run(outcome, error, now, outcome === "failed" ? now : null, id);
  }

  async findForUser(userId: string, id: string): Promise<Job | null> {
    const row = this.db
      .prepare("SELECT * FROM jobs WHERE id = ? AND user_id = ?")
      .get(id, userId) as JobRow | undefined;
    return row ? toJob(row) : null;
  }

  async listForUser(userId: string, type?: string, limit = 50): Promise<Job[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM jobs WHERE user_id = ? AND (? IS NULL OR type = ?)
         ORDER BY created_at DESC LIMIT ?`,
      )
      .all(userId, type ?? null, type ?? null, limit) as JobRow[];
    return rows.map(toJob);
  }

  private get(id: string): Job {
    return toJob(this.db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow);
  }
}
