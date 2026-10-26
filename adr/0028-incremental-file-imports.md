# ADR 0028 - Incremental File Imports

Status: Proposed (assumed by the implementing agent on 2026-10-26, awaiting owner review)

docs/07 asks imports to support an initial full import, incremental refresh, retry and
deduplication. Imports already merged idempotently, but a re-import rewrote every row and
reported only "posts created", so the user could not see what a newer export added.

## Decision

1. **Counted changes.** An import reports, per file, posts and metric snapshots as added,
   changed or unchanged. A post counts as changed when its stored row or its topic links differ
   after the upsert; `last_imported_at` is ignored because it moves on every import.
2. **Unchanged rows are not rewritten.** A metric snapshot is only updated when the merged
   values differ from the stored ones, so `import_job_id` now means "the job that last changed
   this row", not "the last job that read it". The upsert rules are unchanged: a known value is
   never replaced by a missing one, and that case counts as unchanged.
3. **Identical files are skipped.** When the job runs, a file whose SHA-256 matches a file read
   by a completed import job into the same account is skipped unread and reported as "already
   imported on" that job's completion time. Without this, a source dated by the import day (the
   generic CSV) would record the same figures again as a new day's observation.
4. **Checked at run time, per account.** Rejecting at upload was ruled out because the same
   bytes may legitimately go into another account. Only completed jobs count, so a failed or
   crash-requeued job re-reads its files; safety on retry comes from the upserts, not the skip.

## Consequences

- Account days still have their `import_job_id` reassigned on every import, and audience
  segments are replaced whole by design.
- Job results stored before this change have the old shape; only the result of the import that
  just finished is shown, so nothing renders them today.
