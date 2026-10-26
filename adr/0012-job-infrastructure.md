# ADR 0012 - Jobs: Database-Backed Queue with an In-Process Worker

Status: Proposed (assumed by the implementing agent on 2026-10-23; awaiting product review)

Resolves: OD-007

## Decision

- A `jobs` table holds every background job with the fields from docs/04 (type, status,
  progress, error, retry count and timestamps), plus a JSON payload and a JSON result.
- One in-process worker polls the table and atomically claims the oldest due job. The statuses
  are `queued`, `running`, `completed`, `failed` and `retrying` (docs/08).
- A failed job retries up to 3 times with exponential backoff. The last error is kept.
- On startup, jobs left `running` by a crash go back to the queue. Imports are idempotent, so
  this is safe.
- Job types: `import` (file imports) and `ai` (account review, post review and data questions).

## Alternatives considered

- Redis with BullMQ: OD-007 warns against adding Redis just because it is familiar, and it would
  add a service to every self-hosted install.

## If reversed

The worker sits behind a `JobQueue` port, so a hosted deployment can swap in a platform queue.
