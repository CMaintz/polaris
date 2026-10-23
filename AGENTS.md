# Coding Agent Instructions - Project Polaris

## Mission

Build Project Polaris incrementally according to the canonical documentation in this repository.

## Before coding

1. Read `PROJECT.md`.
2. Read the relevant documents in `docs/`.
3. Read applicable ADRs.
4. Search the existing code before introducing abstractions.
5. Check `docs/12-open-decisions.md` before making architectural assumptions.

## Authority hierarchy

When documents conflict:

1. Explicit user/product decision
2. ADR marked Accepted
3. Functional requirements
4. Architecture documentation
5. Implementation notes
6. Agent preference

Do not reinterpret a decided product requirement because another implementation looks easier.

## Engineering principles

- Prefer boring, maintainable code over cleverness.
- Keep domain logic independent from external providers.
- Use interfaces/ports at integration boundaries.
- Do not couple business logic directly to LinkedIn, OpenAI, Anthropic or browser automation.
- Preserve provenance for imported/derived data.
- Make AI output inspectable and reproducible where possible.
- Never silently discard raw source data when it is needed for audit/debugging.
- Keep destructive operations explicit.
- Do not invent metrics or fabricate data.
- Do not add undocumented product behaviour merely because it is easy to implement.

## AI-specific rules

- Provider-agnostic model interface.
- User API keys must be treated as secrets.
- Prompt templates must be versioned.
- Structured AI output should use schemas.
- Store enough metadata to reproduce an AI operation where privacy policy permits.
- Distinguish source facts from AI-derived interpretation.
- AI recommendations should expose their evidence.
- Never present model-generated claims as measured LinkedIn facts.

## Data rules

Every imported data object should have:

- source/provider
- source identifier when available
- observed/imported timestamp
- provenance metadata
- normalized representation

Do not make the normalized model dependent on scraping-specific HTML structures.

## Git/workflow

Use small, coherent commits.

Before considering a task complete:

- run formatting
- run static analysis
- run unit tests
- run integration tests relevant to the changed area
- update documentation when behaviour or architecture changes

## Documentation changes

Architectural decisions belong in ADRs.

New behaviour belongs in the functional specification.

New entities belong in the data model.

New provider behaviour belongs in provider/integration documentation.

Open questions belong in `docs/12-open-decisions.md`.

## Security

Never commit:

- API keys
- cookies
- session tokens
- LinkedIn credentials
- database dumps containing personal data
- production secrets

Use `.env.example` with placeholders.
