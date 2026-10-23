# ADR 0007 - SQLite Behind Repository Ports for the First Web Release

Status: Proposed (assumed by the implementing agent on 2026-10-23; awaiting product review)

Resolves: OD-001. Builds on ADR 0002.

## Context

ADR 0002 chose SQLite for the desktop concept and asked the web version to decide explicitly.

## Decision

- The first release uses SQLite (`better-sqlite3`, WAL mode). It targets a self-hosted,
  single-instance deployment (ADR 0008).
- The application layer talks to repository **ports** that return promises, so a PostgreSQL
  implementation can be added without touching use cases.
- Schema migrations are ordered SQL scripts, tracked with `PRAGMA user_version`.
- Queryable facts are real columns. Provider-specific extras live in a JSON column (docs/05).

## Alternatives considered

- PostgreSQL from day one: right for managed multi-tenant hosting, but it adds an always-on
  server to every self-hosted install.
- Both from day one: this doubles the persistence work before any hosted deployment needs it.

## If reversed

Add a PostgreSQL implementation of the ports and a data migration script. Use cases, the API
and the UI are unaffected.
