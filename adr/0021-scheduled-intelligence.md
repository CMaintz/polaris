# ADR 0021 - Scheduled Intelligence

Status: Proposed (assumed by the implementing agent, awaiting owner review)

docs/04 lists "scheduled intelligence" as a job category without semantics.

## Decision

- A `schedules` table per account: kind (`feed_refresh`, `trend_digest`, `account_review`,
  `research_rerun`), cadence (`daily` or `weekly`), kind-specific params, enabled,
  `next_run_at`, `last_run_at`, `last_job_id`.
- **No second timer.** `Scheduler.tick(now)` is called from the job worker's loop and turns
  due schedules into ordinary jobs, so schedules inherit retries, status and the jobs UI.
- **No double runs.** A schedule whose last job is still queued, running or retrying is left
  due and skipped; it fires on the first tick after that job finishes. Claiming a run is a
  conditional update on `next_run_at`, so two ticks cannot enqueue the same run.
- **No catch-up storms.** The next run is planned from the time of the run, not from the
  missed slot: after an outage a schedule runs once, not once per missed period.
- A new schedule runs on the next tick.
- `account_review` enqueues the existing AI account review job (`AI_JOB`, task
  `account_review`) with the browser timezone saved at creation. It skips AiService's
  enqueue-time checks; a missing key or missing data fails that job visibly.
- Scheduled AI work is billed to the user's own key; the Settings section says so.

## Consequences

- Cadence is coarse (daily or weekly) and runs drift by the time a run waited for its
  predecessor. Cron-style times can be added later in the same table.
