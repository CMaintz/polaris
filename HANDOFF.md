# Project Polaris - Agent Handoff

## What is known

Polaris began as a local Windows/macOS application where users supplied their own OpenAI or Claude API keys. SQLite, provider-based abstractions and the codename Project Polaris were explicitly accepted.

The product direction has now changed: **build it as a web application** for cross-device access.

The original privacy/local-ownership philosophy should survive the platform change.

## Product concept

LinkedIn-focused intelligence and decision support:

**data → analytics → AI interpretation → recommendations → planning → experiments → measured outcomes**

Long-term direction is toward a broader growth operating system and controlled autonomous workflows.

## What is deliberately not settled

- exact frontend/backend stack
- hosted vs self-hosted deployment model
- database choice for web deployment
- authentication
- exact LinkedIn acquisition mechanism
- secure BYOK secret storage
- background job infrastructure
- vector database/storage

Do not pretend these have been decided.

## What the agent should build first

Start by inspecting the repository. Then establish a thin vertical slice that proves:

1. user/account boundary
2. provider abstraction
3. one source import
4. normalized data
5. persistence
6. API
7. simple UI
8. tests

The first real domain slice should likely be account + post import rather than a broad dashboard mockup.

## Important constraint

This documentation is intended to replace dependence on old chat history. Product and architecture decisions should be captured here from this point onward.
