# ADR 0026 - Multiple Accounts and Platforms

Status: Proposed (assumed by the implementing agent on 2026-10-24, awaiting owner review)

This supersedes ADR 0015 item 1 ("one LinkedIn account per user"). docs/11 phase 7 asks for
additional providers, cross-platform analytics and a unified content strategy, and docs/14 for a
multi-platform-ready domain model.

## Decision

1. **Accounts and platforms.** A user has any number of accounts, one per profile on a platform.
   `accounts` gains `platform` (`linkedin` or `other`) and a user-chosen `label`. Existing rows
   become `linkedin` / "LinkedIn". The old `UNIQUE (user_id)` cannot be dropped in SQLite, so
   the migration rebuilds the table. It runs with foreign keys off (the old table's drop would
   otherwise cascade into every child table) and checks `foreign_key_check` before it commits.
   `migrate()` supports such entries explicitly. The platform of an account never changes, since
   its data was validated against it.
2. **Active account.** `users.active_account_id` (nullable, `ON DELETE SET NULL`) records the
   account the user works in. The rule "the chosen account, else the oldest" lives once, in
   `domain/accounts.ts`. `ContentStore.findAccount`, `ensureAccount` and the `ResolveAccount`
   built in `composition/core.ts` all use it, and every feature (analytics, AI, planning,
   strategy, knowledge, intelligence, action) resolves through one of these. Switching therefore
   changes what every feature sees, with no per-feature change. Creating an account makes it
   active, because the next step is nearly always importing into it.
3. **Writes before any import.** `ensureAccount` returns the active account and creates a
   LinkedIn account only when the user has none, inside one transaction.
4. **Management.** `/accounts` lists, creates, renames, activates and deletes. Every query is
   scoped by user id, so another user's account id behaves exactly like an unknown one (404).
   Deleting needs the password again and cascades that account's data. Raw uploads and AI
   interaction logs are kept per user, not per account, so they stay until "delete imported
   data" or account deletion. Deleting the last account is allowed; the next write creates a
   fresh LinkedIn account.
5. **Imports.**
   - The target is fixed when the import starts: the job payload carries the account id, so
     switching while the job waits cannot redirect it. Jobs queued before this change carry
     none and use the active account. A job whose account was deleted fails for good.
   - Each provider declares one platform. The first provider that can read a file decides, and
     it must match the account's platform, or the upload is refused with a `ValidationError`
     naming the file, the provider and the account. LinkedIn adapters fit only LinkedIn
     accounts; demo data is LinkedIn data and loads only into a LinkedIn account.
   - **`generic-csv`** fits only `other` accounts. A LinkedIn account takes LinkedIn's own
     exports, which identify posts by URN; mixing a second identity scheme into one account
     would duplicate posts.
   - Generic headers (case, spaces and punctuation ignored): required `date` (aliases
     published, published at, publish date, created) and `text` (content, body, post,
     caption); optional `url` (link, post url), `type` (content type, media type),
     `impressions` (views), `reactions` (likes), `comments`, `reposts` (shares),
     `engagements`, `hashtags` (tags, topics). Rows without a date or text are skipped with a
     warning; a file without either column fails.
   - Identity: `url:` plus the URL without its fragment (query strings are permalinks on some
     platforms), else `sha256:` of the timestamp and the text with line endings normalised. Re-imports are idempotent either way; editing a
     link-less post's text makes it a new post.
   - **A generic CSV is a full listing** of the posts in its date range, like the LinkedIn data
     archive, so it supports post counts and pillar shares. A platform's own post export lists
     every post the user published; treating it as partial would leave "posts published"
     unknown for every non-LinkedIn account. If a user uploads a filtered file, counts for
     those days are understated; the import screen says the file is read as complete.
   - Engagements are taken only from an `engagements` column. Polaris' existing rule sums
     reactions, comments and reposts only when all three are known, and never otherwise.
   - Metrics are observed on the import day, with no period, as the file states none.
6. **Data lifecycle.** The export lists every account under `accounts` and every account's rows
   (format `polaris-export/v2`). "Delete imported data" clears imported data in every account
   and keeps labels and the user's own records. Deleting the user removes all accounts.
7. **Comparison.** `/analytics/compare` gives one row per account with the dashboard's KPI
   computation and the same period for every row: it ends on the latest day of data across all
   accounts, since each account's own latest day would compare different weeks. Missing data is
   null with its coverage, never zero.
8. **Unified strategy.** The planner and pillars stay per account. `/plan/all` is a read-only
   view of every account's plan items, labelled with their account, by planned date (undated
   last).
9. **Stored dataset value.** `posts.dataset` stays `linkedin` or `demo`; `linkedin` now means
   "real imported data" on every platform. Renaming it needs a rebuild of the posts table and
   its dependants, which is not worth the risk for a label. `hasLinkedInData` in the API keeps
   its name with the same meaning.

## Consequences

- Every job carries the account it was queued for, and loads it owner-checked, so switching
  accounts while a job waits never redirects its result.
- A LinkedIn publishing connection can be made on an `other` account; nothing posts there
  unless the user schedules a draft, but the connection screen does not yet refuse it.
- A new platform with its own adapter needs a platform value (a CHECK change, so a migration)
  and a provider that declares it.
