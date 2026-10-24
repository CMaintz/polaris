# ADR 0014 - AI Orchestration: Evidence First, Schema-Validated, Provider-Neutral

Status: Proposed (assumed by the implementing agent on 2026-10-23; awaiting product review)

## Decision

- An `AiProvider` port with `generateStructured`. The adapters use each vendor's official
  SDK (`@anthropic-ai/sdk`, `openai`) behind that port. Hand-written HTTP clients were
  considered and rejected: the SDKs own retries, typed errors and structured-output parsing,
  and the port already keeps them out of the application layer.
- Default models: Anthropic `claude-opus-5-5`, OpenAI `gpt-5`. The user can set any model
  name when saving a key. The OpenAI default is a guess at a sensible current model and is the
  first thing to revisit.
- Anthropic calls use structured outputs, effort `high` for review work, and the server-side
  refusal fallback (`fallbacks: "default"`), so a safety-classifier decline is retried on
  Anthropic's recommended model instead of failing the review. A final refusal fails the job.
  OpenAI calls use the Responses API with a zod text format.
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
and testing a key before saving it. AI content themes are in ADR 0018.
