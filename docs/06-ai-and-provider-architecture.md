# AI and Provider Architecture

## Provider abstraction

The system must not directly depend on OpenAI or Anthropic APIs from domain/application code.

Conceptually:

```text
AiProvider
  - generateText()
  - generateStructured()
  - embed()
  - capabilities()
```

Provider implementations:

- OpenAIProvider
- AnthropicProvider
- future providers

## Model selection

The application should select a provider/model through configuration and capabilities rather than provider-specific conditionals scattered throughout the codebase.

## Prompt management

Prompts should be:

- versioned
- named
- stored in source control
- tested
- associated with an expected output schema

Example:

`account-review/v1`

## Structured generation

Prefer typed structured output for:

- classifications
- topic extraction
- insight generation
- recommendations
- experiment suggestions

Free-form generation is appropriate for prose drafts.

## Retrieval

AI analysis should be built from explicit context:

```text
Question
  -> Intent
  -> Data query
  -> Evidence set
  -> Optional semantic retrieval
  -> Prompt construction
  -> Model
  -> Structured result
  -> Evidence links
```

The model should never be treated as the source of truth for metrics.

## BYOK

The product originally required users to supply their own OpenAI or Claude API key.

The web version should preserve that principle unless a later product decision explicitly changes it.

Potential modes:

1. user-managed API key
2. provider OAuth/connection
3. managed model billing (future, optional)

## AI safety and reliability

- Validate structured output.
- Retry transient failures.
- Detect malformed responses.
- Bound context size.
- Record model/version metadata.
- Never let an AI response silently mutate important data.
- Use approval steps for consequential actions.
