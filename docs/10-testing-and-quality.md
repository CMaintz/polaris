# Testing and Quality

## Test pyramid

### Unit tests

Focus on:

- domain calculations
- analytics
- metric aggregation
- recommendation rules
- data normalization
- prompt construction

### Integration tests

Focus on:

- repositories
- database
- provider adapters
- job processing
- API contracts

### End-to-end tests

Focus on:

- onboarding
- importing data
- dashboard
- content explorer
- AI review
- planning
- experiments

## AI tests

AI functionality should use deterministic fixtures where possible.

Test:

- schema validity
- required fields
- refusal/error behaviour
- provenance
- prompt injection resistance
- regression examples

Do not build tests that require one exact natural-language response unless the output is explicitly constrained.

## Import tests

Verify:

- idempotency
- duplicate handling
- partial failures
- retries
- missing metrics
- changed source data

## Analytics tests

Include hand-calculated fixtures for:

- growth
- rolling averages
- period comparison
- engagement rates
- cohorts

## Quality gates

The repository should eventually enforce:

- formatting
- linting
- static typing
- unit tests
- integration tests
- dependency/security checks
- build verification

These gates should be runnable locally and in CI.
