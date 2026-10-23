# ADR 0008 - Deployment: Self-Hosted Single Instance

Status: Proposed (assumed by the implementing agent on 2026-10-23; awaiting product review)

Resolves: OD-005

## Context

PROJECT.md wants cross-device access while keeping the privacy spirit of the local-first design.

## Decision

- The first release is a self-hosted web app. One Node process serves the API and the built SPA
  from one SQLite file. Users reach it from any device through their own host: a home server,
  a VPS or a private network.
- Configuration is environment variables (`.env.example`). Nothing goes to any service Polaris
  runs; the only outbound calls are to the AI provider the user configures.
- Managed hosting stays possible: every query is scoped by user (ADR 0009), so the same code can
  serve several users.

## Alternatives considered

- Managed SaaS first: fastest onboarding, but Polaris would hold everyone's LinkedIn data, which
  is the opposite of the stated principle.

## If reversed

Managed hosting needs PostgreSQL (ADR 0007), a per-user key strategy (ADR 0011), and rate limits
on signup and login.
