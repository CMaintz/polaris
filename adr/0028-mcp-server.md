# ADR 0028 - A Local, Read-Only MCP Server

Status: Proposed (assumed by the implementing agent on 2026-10-26; awaiting owner review)

## Context

The owner wants to ask Claude Desktop about their own Polaris data ("which posts did best this
quarter, and what did they have in common?"). Every analytics route sits behind cookie auth and
the CSRF check, which a desktop MCP client cannot take part in.

## Decision

1. **Transport.** A stdio MCP server (`npm run mcp`, `src/server/mcp/main.ts`), launched by the
   client on the machine that holds the database. No remote or multi-user server.
2. **Application layer, not HTTP.** The process builds the same analytics reads as the web app
   (`composition/analytics.ts`, used by both composition roots; the MCP's own root is
   `composition/mcp.ts`) and calls `AnalyticsService`
   directly with a configured user id. The HTTP side gains no auth bypass.
3. **Which user.** `POLARIS_USER_ID` when set, and it must exist. Without it, the only user in
   the database. With none or several, the server refuses to start rather than guess, since a
   wrong guess shows one person another's data. Each tool reads that user's active account
   (ADR 0026), exactly as the routes do.
4. **Read-only database.** The file is opened with `readonly: true` and never migrated, so the
   server can run beside the web app and cannot change the data. It refuses a missing file and
   a schema version other than the current one; starting the web app migrates it.
5. **Tools.** `dashboard`, `list_posts`, `get_post`, `timeseries`, `breakdowns`,
   `rule_insights`, `audience`, one per analytics route, each with an `outputSchema` and
   `structuredContent`. Their choices (sort keys, metrics, limits) come from
   `application/analytics/query-options.ts`, shared with the routes so the two cannot drift.
   Results are parsed through the output schema before they are sent, so a field added to a
   DTO later is not exposed until it is named there.
6. **Data, not analysis.** The tools return measured numbers and post text. The client's model
   does the reasoning; Polaris's own AI review (BYOK, ADR 0004) stays a separate feature.
7. **Privacy.** Every tool description says that its result, post text included, goes to the
   model the client uses. Polaris stores no comment authors, so `get_post` has none to return.

## Consequences

- One person, one machine. Using it from elsewhere would need a remote transport with real
  auth, which is a separate decision.
- No imports, writes, planning or strategy tools. Those features' ADRs are still Proposed.
- A tool call reads the account's posts and daily metrics in separate statements. Each sees its
  own WAL snapshot, so an import the web app commits in between can leave one answer mixing
  before and after figures. A retry gives a consistent answer; wrapping each call in a read
  transaction would close the gap if it ever matters.
- `breakdowns` and `rule_insights` cover all of the account's posts: the service has no date
  range for them, and adding one is a change to the web feature too.

## Alternatives considered

- Teaching the MCP server to log in over HTTP: needs a stored password or session token and
  a CSRF exemption, for no gain on one machine.
- A separate query layer for the MCP: a second definition of every metric, which is exactly
  what drifts.
