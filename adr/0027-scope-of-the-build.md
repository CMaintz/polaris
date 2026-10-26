# ADR 0027 - Scope of the Build: Every Roadmap Phase

Status: Proposed (assumed by the implementing agent on 2026-10-24; awaiting product review)

## Context

docs/02 splits capabilities into "MVP" and "Later", and docs/11 orders the work in phases 0 to 7.
The first build stopped at phase 4 without saying so. The owner asked for the complete app.

## Decision

Every capability named in docs/02, docs/11 and docs/14 is implemented. Where the docs leave a
choice open, the choice is recorded as its own ADR:

| Area (docs/14)                                                        | Phase | ADRs             |
| --------------------------------------------------------------------- | ----- | ---------------- |
| Intelligence: overview, content, audience, trends, AI reviews, ask    | 0-3   | 0006-0016        |
| Strategy: goals, experiments, planning                                | 4     | 0015             |
| Strategy: campaigns, content pillars, funnel analysis                 | 4     | 0022, 0023       |
| Knowledge: search, semantic search, themes, Ask retrieval             | 5     | 0017, 0018       |
| Knowledge: trend feeds, research, peers, scheduled intelligence       | 5     | 0019, 0020, 0021 |
| Action: drafting, approvals, agentic planning, scheduling, publishing | 6     | 0024, 0025       |
| Platform: several accounts and platforms, cross-platform comparison   | 7     | 0026             |

## What cannot be verified without live credentials

These parts are tested only against fakes that follow the vendors' documented or SDK-typed
shapes:

- LinkedIn's export file layouts (ADR 0010).
- OpenAI and Anthropic calls: structured output, embeddings and server-side web search.
- LinkedIn OAuth and the Posts API (ADR 0025, OD-009).
- Live RSS and Atom fetching (the SSRF guard itself is tested against a fake resolver and a
  loopback server).

## Not built

- **Telemetry** (docs/04 infrastructure list): there is no metrics or tracing pipeline; the
  server logs to stdout, and AI calls and security events are recorded in the database.
- **A metric-refresh job and incremental refresh** (docs/04, docs/07): LinkedIn offers no
  API that Polaris may pull from, so refreshing means uploading a newer export, which merges
  idempotently. There is no background job that fetches anything from LinkedIn.
- A LinkedIn publishing connection is not refused on an account of platform "other" (nothing
  posts there unless the user schedules a draft).

## Consequences

- The product surface is large for a single-user tool. Each area can be hidden or removed on its
  own, since every area is a separate set of modules wired in `src/server/composition/`.
- Anything here that the owner does not want is a deletion, not a rewrite.
