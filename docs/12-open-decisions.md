# Open Decisions

This file is intentionally explicit so coding agents do not guess.

The first build had to pick an answer for each of these to ship a working app. Every pick is recorded as a **Proposed** ADR and stays open for product review. ADRs 0014 to 0016 record further assumptions that had no entry here.

## OD-001 - Database for the web version

**Status:** Assumed, awaiting review. See [ADR 0007](../adr/0007-sqlite-for-web.md).

SQLite was previously selected when Polaris was a local Windows/macOS application.

The product is now a web application.

Questions:

- Continue with SQLite for a single-user/self-hosted deployment?
- Use PostgreSQL for the hosted web application?
- Support SQLite locally and PostgreSQL in hosted deployments?

Recommendation for investigation: preserve a repository abstraction so the domain is not coupled to either.

## OD-002 - Frontend/backend technology

**Status:** Assumed, awaiting review. See [ADR 0006](../adr/0006-web-stack.md).

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

**Status:** Assumed, awaiting review. See [ADR 0009](../adr/0009-authentication.md).

Need to decide:

- local single-user authentication
- email/password
- OAuth
- passkeys
- social login

## OD-004 - LinkedIn data acquisition

**Status:** Assumed, awaiting review. See [ADR 0010](../adr/0010-linkedin-data-acquisition.md).

Need to determine the exact set of data available through permitted official APIs versus other user-authorized mechanisms.

## OD-005 - Deployment model

**Status:** Assumed, awaiting review. See [ADR 0008](../adr/0008-deployment-model.md).

Potential modes:

- self-hosted
- managed hosted
- both

## OD-006 - Secret storage

**Status:** Assumed, awaiting review. See [ADR 0011](../adr/0011-byok-secret-storage.md).

Need a concrete design for BYOK keys and provider credentials.

## OD-007 - Job infrastructure

**Status:** Assumed, awaiting review. See [ADR 0012](../adr/0012-job-infrastructure.md).

Need to select between:

- database-backed jobs
- Redis-backed queue
- platform-native queue
- other lightweight mechanism

Avoid introducing Redis solely because it is familiar.

## OD-008 - Vector storage

**Status:** Assumed, awaiting review. See [ADR 0017](../adr/0017-search-and-embeddings-in-sqlite.md), which supersedes ADR 0013.

The semantic-search layer may use PostgreSQL/pgvector or another vector store. Do not add a separate vector database before the need is demonstrated.

## OD-009 - Posting as a member through the Posts API

**Status:** Open. See [ADR 0025](../adr/0025-publishing-providers.md).

LinkedIn's Posts API documentation only shows organization authors. Whether `w_member_social`
lets a self-serve app post as `urn:li:person:{id}` through `/rest/posts`, and whether the
3,000-character limit counts the escaped or the plain text, needs confirming against a real app.
