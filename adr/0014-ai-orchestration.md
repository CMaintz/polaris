# ADR 0014 - AI Orchestration: Evidence First, Schema-Validated, Provider-Neutral

Status: Proposed (assumed by the implementing agent on 2026-10-23; awaiting product review)

## Decision

- An `AiProvider` port exposes `generateStructured` and `capabilities`. The OpenAI and Anthropic
  adapters call each provider's HTTP API directly with `fetch`, so no vendor SDK enters the
  dependency tree. Each user can configure their default model.
- Prompts live in source control as named, versioned modules (`account-review/v1`,
  `post-review/v1`, `ask-data/v1`), each with a zod output schema. Output that fails its schema
  is rejected and the job fails visibly; nothing is half-saved.
- **Evidence first.** Polaris computes the facts itself (metrics, comparisons, top posts) and
  gives the model a numbered evidence set. The model must cite evidence ids. Citations to ids
  outside the set are dropped, and the insight's confidence is lowered. Metrics shown to the
  user always come from the database, never from model text.
- Imported post text is untrusted. Prompts fence it as data, and the system prompt tells the
  model to ignore any instructions inside it (docs/09).
- Every call is recorded in `ai_interactions`: provider, model, prompt name and version, a
  summary of the data sent, token usage and the validated output. Full prompts are not stored,
  so post text is not duplicated.
- Rule-based insights (period change, best content type, best weekday, top topic, outlier posts)
  need no AI key, so the product is useful before the user adds one. The UI labels them "Rule"
  and AI insights "AI".
- Keyword rules classify each data question into an intent, and only that intent's structured
  data is sent. The model never gets database access.

## Not yet done

Automatic retries on malformed model output (one attempt, then the job fails), cost estimates,
and AI topic extraction (topics come from hashtags for now).
