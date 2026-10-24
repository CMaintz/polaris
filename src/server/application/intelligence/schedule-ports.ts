import type { Cadence, ScheduleKind, ScheduleParams } from "../../../shared/intelligence-types";

export interface Schedule {
  id: string;
  kind: ScheduleKind;
  cadence: Cadence;
  params: ScheduleParams;
  enabled: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  lastJobId: string | null;
  createdAt: string;
}

export interface DueSchedule extends Schedule {
  accountId: string;
  userId: string;
}

export interface ScheduleStore {
  list(accountId: string): Promise<Schedule[]>;
  get(accountId: string, id: string): Promise<Schedule | null>;
  create(
    accountId: string,
    values: Pick<Schedule, "kind" | "cadence" | "params" | "nextRunAt">,
    now: string,
  ): Promise<Schedule>;
  update(
    accountId: string,
    id: string,
    patch: Partial<Pick<Schedule, "cadence" | "enabled">>,
    now: string,
  ): Promise<Schedule | null>;
  delete(accountId: string, id: string): Promise<boolean>;
  due(now: string): Promise<DueSchedule[]>;
  /**
   * Moves a schedule from `expectedNextRunAt` to `nextRunAt`. False when another tick got
   * there first, which is what keeps two ticks from enqueueing the same run.
   */
  claim(id: string, expectedNextRunAt: string, nextRunAt: string, now: string): Promise<boolean>;
  setLastJob(id: string, jobId: string): Promise<void>;
}
