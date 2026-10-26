# ADR 0029 - Telemetry

Status: Proposed (assumed by the implementing agent on 2026-10-26, awaiting owner review)

docs/04 lists telemetry under infrastructure and specifies nothing more. Polaris is
self-hosted and single-process, and docs/09 forbids leaking personal data.

## Decision

1. **A port and an in-process adapter.** `application/telemetry` defines counters and duration
   histograms; `infrastructure/telemetry` keeps them in memory and renders the Prometheus text
   format. No new dependency, and no collector is required. Values reset on restart, which
   Prometheus handles for counters.
2. **What is measured.** HTTP requests (method, route pattern, status class, duration), job
   attempts (job type, outcome, duration) and AI provider calls (provider, outcome). AI calls are
   counted in the interaction store, which every call already passes through (ADR 0014).
   Imports are measured as their job type.
3. **Bounded, anonymous labels.** Label names are a closed type, and every value comes from code:
   the matched route pattern (`unmatched` when nothing matched), a fixed method list, the status
   class, registered job types (`unknown` otherwise) and provider ids. No user id, account id,
   job id, path, file name, error text or post text reaches a label or a log line.
4. **Logs.** One JSON line per finished job attempt and per 5xx response, holding only the
   labels, the time and the duration in milliseconds.
5. **Endpoint.** `GET /api/metrics` exists only when `POLARIS_METRICS_TOKEN` is set, and then
   needs `Authorization: Bearer <token>`, compared in constant time. Even a single user's request
   counts describe their activity, so it is never open.

## Consequences

- Several processes would each report their own figures; that matches the single-process
  deployment (docs/04).
- There is no tracing. Spans can be added behind the same port if a deployment needs them.
