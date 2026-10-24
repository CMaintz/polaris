import type { JobRepository } from "../jobs/ports";
import type { Cadence } from "../../../shared/intelligence-types";
import { scheduledJob } from "./jobs";
import type { DueSchedule, ScheduleStore } from "./schedule-ports";

const CADENCE_MS: Record<Cadence, number> = { daily: 86_400_000, weekly: 7 * 86_400_000 };
const PENDING = new Set(["queued", "running", "retrying"]);

/**
 * Turns due schedules into jobs (ADR 0021). The job worker calls `tick` on its own loop, so
 * there is no second timer; `tick` is safe to call as often as the worker likes.
 */
export class Scheduler {
  constructor(
    private readonly store: ScheduleStore,
    private readonly jobs: Pick<JobRepository, "enqueue" | "findForUser">,
  ) {}

  async tick(now: Date): Promise<number> {
    let enqueued = 0;
    for (const schedule of await this.store.due(now.toISOString())) {
      if (await this.run(schedule, now)) enqueued += 1;
    }
    return enqueued;
  }

  private async run(schedule: DueSchedule, now: Date): Promise<boolean> {
    // A run still waiting keeps the schedule due, so it fires as soon as that run is done.
    if (await this.previousPending(schedule)) return false;
    // Planned from now rather than from the missed slot, so an outage costs one catch-up
    // run instead of one per missed period.
    const next = new Date(now.getTime() + CADENCE_MS[schedule.cadence]).toISOString();
    const iso = now.toISOString();
    if (!(await this.store.claim(schedule.id, schedule.nextRunAt, next, iso))) return false;
    const job = await this.jobs.enqueue(scheduledJob(schedule), iso);
    await this.store.setLastJob(schedule.id, job.id);
    return true;
  }

  private async previousPending(schedule: DueSchedule): Promise<boolean> {
    if (!schedule.lastJobId) return false;
    const job = await this.jobs.findForUser(schedule.userId, schedule.lastJobId);
    return job !== null && PENDING.has(job.status);
  }
}
