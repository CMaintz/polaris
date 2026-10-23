# Open Decisions

This file is intentionally explicit so coding agents do not guess.

## OD-001 - Database for the web version

**Status:** Open

SQLite was previously selected when Polaris was a local Windows/macOS application.

The product is now a web application.

Questions:

- Continue with SQLite for a single-user/self-hosted deployment?
- Use PostgreSQL for the hosted web application?
- Support SQLite locally and PostgreSQL in hosted deployments?

Recommendation for investigation: preserve a repository abstraction so the domain is not coupled to either.

## OD-002 - Frontend/backend technology

**Status:** Open

The prior project context does not contain a final web stack decision.

The implementation should select a stack based on:

- developer productivity
- type safety
- background jobs
- charting
- deployment simplicity
- long-term maintainability

Do not claim a stack is already decided.

## OD-003 - Authentication

**Status:** Open

Need to decide:

- local single-user authentication
- email/password
- OAuth
- passkeys
- social login

## OD-004 - LinkedIn data acquisition

**Status:** Open

Need to determine the exact set of data available through permitted official APIs versus other user-authorized mechanisms.

## OD-005 - Deployment model

**Status:** Open

Potential modes:

- self-hosted
- managed hosted
- both

## OD-006 - Secret storage

**Status:** Open

Need a concrete design for BYOK keys and provider credentials.

## OD-007 - Job infrastructure

**Status:** Open

Need to select between:

- database-backed jobs
- Redis-backed queue
- platform-native queue
- other lightweight mechanism

Avoid introducing Redis solely because it is familiar.

## OD-008 - Vector storage

**Status:** Open

The semantic-search layer may use PostgreSQL/pgvector or another vector store. Do not add a separate vector database before the need is demonstrated.
