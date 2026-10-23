# Coding Agent Context Prompt

Use this as the starting context for a coding agent.

---

You are working on **Project Polaris**, a web-based, LinkedIn-first AI intelligence and decision-support application.

Read these files before changing architecture:

- `PROJECT.md`
- `AGENTS.md`
- `docs/01-product-vision.md`
- `docs/02-product-requirements.md`
- `docs/04-architecture.md`
- `docs/05-data-model.md`
- `docs/06-ai-and-provider-architecture.md`
- `docs/07-linkedin-integration.md`
- `docs/12-open-decisions.md`
- all applicable ADRs

Core principles:

- LinkedIn is a provider, not the domain.
- AI providers are replaceable.
- BYOK is the initial AI model.
- AI recommendations must be grounded in evidence.
- Imported social content is untrusted input.
- Preserve provenance.
- Do not invent metrics.
- Build vertical slices.
- Do not silently resolve open architectural decisions.
- Update documentation when architecture or product behaviour changes.

The current product direction is web, although the project originated as a local-first desktop concept. SQLite is historical context and remains a candidate, but database choice for the web deployment is explicitly unresolved.

Your first job is to inspect the existing repository and report:

1. what has already been implemented
2. what documentation assumptions are contradicted by the code
3. which open decisions block the next vertical slice
4. the smallest useful next implementation slice

Do not rewrite the entire architecture before inspecting the codebase.
