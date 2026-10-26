# ADR 0030 - Metric Refresh Through LinkedIn's API

Status: Proposed (assumed by the implementing agent on 2026-10-26, awaiting owner review)

This supersedes ADR 0027's claim that LinkedIn offers no API Polaris may pull from, and adds
to ADR 0010, under which data came only from the user's exports. LinkedIn's Community
Management API documents member post statistics (`memberCreatorPostAnalytics`, scope
`r_member_postAnalytics`) and follower statistics (`memberFollowersCount`, scope
`r_member_profileAnalytics`):

- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/members/post-statistics
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/members/follower-statistics

LinkedIn approves that product per app, so a self-hoster's app may never get these scopes.

## Decision

1. **Opt-in scopes.** `POLARIS_LINKEDIN_ANALYTICS=true` adds both scopes to the LinkedIn
   connection (ADR 0025). Off by default, because asking for a scope the app lacks breaks
   sign-in. The scopes LinkedIn granted are stored on the connection, and refresh is offered only
   when both were granted, the sign-in has not expired and the account's platform is LinkedIn.
2. **A `metric-refresh` job** with provider id `linkedin-api`, written through the same import
   path as files. It runs on demand ("Refresh from LinkedIn" under publishing connections) or as
   a daily or weekly schedule (a new schedule kind).
3. **Incremental.** Account days run from the day after the last refreshed day with impressions
   up to yesterday; the first run, and the most a missed stretch catches up, is 90 days. Posts
   published in the last `POLARIS_LINKEDIN_REFRESH_POST_DAYS` days (default 30), plus posts never
   refreshed, get their lifetime totals, at most 100 posts per run.
4. **Only share and ugcPost posts.** The API accepts no other URN, and the exports mostly carry
   `activity` URNs, so per-post refresh covers posts Polaris published itself; the page says how
   many of the account's posts that is. Account-level impressions and followers cover everything.
5. **Figures.** Posts get impressions, reactions, comments and reposts; clicks and engagements stay
   missing, so engagements follow the same sum rule as other sources. Account days get daily
   impressions from the `me` finder (its reaction, comment and repost counts are documented as
   inconsistent with LinkedIn's UI, so they are not read) and follower gains, with totals
   back-calculated from the lifetime count as the analytics export does.
6. **Failures.** 401 and 403 fail the job for good and ask the user to reconnect; 429, 5xx and
   network errors retry with backoff. A post LinkedIn refuses is skipped with a warning.

## Assumptions not verifiable without approved credentials

- Daily `memberFollowersCount` values are gains (as the documented samples suggest), not totals.
- The token response's `scope` field lists granted scopes, separated by commas or spaces.
- Day buckets are UTC, and a page holds at least the 7 days each request asks for.
- `metricType` is a wrapped object up to version 202604 and a plain string from 202605, as the
  docs show; both are accepted.
- A day LinkedIn leaves out is stored as missing, never as zero (docs/10).

## Consequences

- A run fetches everything before writing anything, so a 429 late in a large first run retries
  the whole run.
- Tokens last 60 days without a refresh token; a schedule then fails until the user reconnects.
