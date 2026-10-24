import { randomUUID } from "node:crypto";
import type { DueSchedule, Schedule, ScheduleStore } from "../../application/intelligence/ports";
import type { Cadence, ScheduleKind, ScheduleParams } from "../../../shared/intelligence-types";
import { type Db, fromJson, toJson } from "../db/database";

interface ScheduleRow {
  id: string;
  account_id: string;
  user_id?: string;
  kind: ScheduleKind;
  cadence: Cadence;
  params: string;
  enabled: number;
  next_run_at: string;
  last_run_at: string | null;
  last_job_id: string | null;
  created_at: string;
}

function toSchedule(row: ScheduleRow): Schedule {
  return {
    id: row.id,
    kind: row.kind,
    cadence: row.cadence,
    params: fromJson<ScheduleParams>(row.params) ?? {},
    enabled: row.enabled === 1,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    lastJobId: row.last_job_id,
    createdAt: row.created_at,
  };
}

export class SqliteScheduleStore implements ScheduleStore {
  constructor(private readonly db: Db) {}

  async list(accountId: string): Promise<Schedule[]> {
    const rows = this.db
      .prepare("SELECT * FROM schedules WHERE account_id = ? ORDER BY created_at")
      .all(accountId) as ScheduleRow[];
    return rows.map(toSchedule);
  }

  async get(accountId: string, id: string): Promise<Schedule | null> {
    const row = this.db
      .prepare("SELECT * FROM schedules WHERE account_id = ? AND id = ?")
      .get(accountId, id) as ScheduleRow | undefined;
    return row ? toSchedule(row) : null;
  }

  async create(
    accountId: string,
    values: Pick<Schedule, "kind" | "cadence" | "params" | "nextRunAt">,
    now: string,
  ): Promise<Schedule> {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO schedules (id, account_id, kind, cadence, params, next_run_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        accountId,
        values.kind,
        values.cadence,
        toJson(values.params),
        values.nextRunAt,
        now,
        now,
      );
    return (await this.get(accountId, id)) as Schedule;
  }

  async update(
    accountId: string,
    id: string,
    patch: Partial<Pick<Schedule, "cadence" | "enabled">>,
    now: string,
  ): Promise<Schedule | null> {
    const enabled = patch.enabled === undefined ? null : Number(patch.enabled);
    this.db
      .prepare(
        `UPDATE schedules SET cadence = COALESCE(?, cadence), enabled = COALESCE(?, enabled),
           updated_at = ? WHERE account_id = ? AND id = ?`,
      )
      .run(patch.cadence ?? null, enabled, now, accountId, id);
    return this.get(accountId, id);
  }

  async delete(accountId: string, id: string): Promise<boolean> {
    return (
      this.db.prepare("DELETE FROM schedules WHERE account_id = ? AND id = ?").run(accountId, id)
        .changes === 1
    );
  }

  async due(now: string): Promise<DueSchedule[]> {
    const rows = this.db
      .prepare(
        `SELECT s.*, a.user_id FROM schedules s JOIN accounts a ON a.id = s.account_id
         WHERE s.enabled = 1 AND s.next_run_at <= ? ORDER BY s.next_run_at`,
      )
      .all(now) as (ScheduleRow & { user_id: string })[];
    return rows.map((row) => ({
      ...toSchedule(row),
      accountId: row.account_id,
      userId: row.user_id,
    }));
  }

  async claim(
    id: string,
    expectedNextRunAt: string,
    nextRunAt: string,
    now: string,
  ): Promise<boolean> {
    return (
      this.db
        .prepare(
          `UPDATE schedules SET next_run_at = ?, last_run_at = ?
           WHERE id = ? AND next_run_at = ? AND enabled = 1`,
        )
        .run(nextRunAt, now, id, expectedNextRunAt).changes === 1
    );
  }

  async setLastJob(id: string, jobId: string): Promise<void> {
    this.db.prepare("UPDATE schedules SET last_job_id = ? WHERE id = ?").run(jobId, id);
  }
}
