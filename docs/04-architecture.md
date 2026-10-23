# Architecture

## Architectural direction

Polaris is a web application with a modular backend and provider-based integration layer.

A practical initial shape:

```text
Web Client
    |
    v
Application/API Layer
    |
    +-------------------+
    |                   |
    v                   v
Domain/Application   AI Orchestration
    |                   |
    v                   v
Repositories       AI Provider Interface
    |                   |
    v                   +--> OpenAI
SQLite/Postgres?       +--> Anthropic
    |
    +--> LinkedIn Provider
    +--> External Intelligence Providers
```

## Important note about persistence

SQLite was previously selected as the initial database because the original product was local-first.

Now that the product is a web application, the implementation must decide whether SQLite remains appropriate for the first deployment or whether a server database should be used from the start. The existing decision is retained as a constraint/history, but this is explicitly an open architectural decision.

See `docs/12-open-decisions.md`.

## Layers

### Domain

Pure business concepts:

- Account
- Post
- Metric
- Audience
- Insight
- Recommendation
- Goal
- Experiment
- ContentPlan
- ProviderConnection

### Application

Use cases:

- ImportLinkedInData
- RefreshAnalytics
- AnalysePost
- AnalyseAccount
- CreateExperiment
- GenerateContentPlan
- AskDataQuestion

### Infrastructure

- database
- LinkedIn integration
- browser automation
- LLM providers
- external trend providers
- job queue
- telemetry

### API

Stable contracts between frontend and backend.

### Frontend

Feature-oriented UI rather than provider-oriented UI.

## Background jobs

Imports and AI analyses should not block HTTP requests.

Initial job categories:

- import
- metric refresh
- AI analysis
- embedding/indexing
- scheduled intelligence

A job should have:

- id
- type
- status
- created_at
- started_at
- completed_at
- progress
- error
- retry count

## Browser automation

If browser automation is used, isolate it completely behind a provider adapter.

The domain must never know about selectors, pages, DOM nodes or Playwright.

## Deployment philosophy

The web deployment should preserve privacy and minimise unnecessary server retention.

A later deployment may support:

- self-hosting
- private single-user instance
- managed hosting

The architecture should not make any one deployment model impossible.
