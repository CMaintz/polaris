# ADR 0006 - Web Stack: TypeScript, Hono and React

Status: Proposed (assumed by the implementing agent on 2026-10-23; awaiting product review)

Resolves: OD-002

## Context

No stack was decided. OD-002 lists the criteria: developer productivity, type safety, background
jobs, charting, deployment simplicity and long-term maintainability.

## Decision

- One TypeScript package for both sides, so API contracts are shared types, not duplicated DTOs.
- Backend: Node 22 with [Hono](https://hono.dev) on `@hono/node-server`. It is small and typed,
  and it runs on other runtimes too, so a later runtime move is not a rewrite.
- Frontend: a React 19 single-page app built with Vite, with Recharts for charts.
- Validation at the HTTP boundary and for AI output: zod.
- Layers follow docs/04: `src/server/domain` (pure), `application` (use cases and ports),
  `infrastructure` (SQLite, LinkedIn adapters, AI adapters, crypto, jobs) and `api` (HTTP).
- Quality gate: Foundry's `ts` stack (prettier, eslint, `tsc`, vitest with a coverage floor,
  npm audit, gitleaks and semgrep).

## Alternatives considered

- Next.js: server components and API routes in one framework, but it ties the backend to a
  framework's deployment model and complicates the in-process job worker.
- A .NET or Java backend with a separate TS frontend: strong typing, but two toolchains and
  hand-synchronised contracts for a product with one developer.

## If reversed

The domain and application layers have no framework imports. Only `src/server/api` and
`src/web` would be rewritten.
