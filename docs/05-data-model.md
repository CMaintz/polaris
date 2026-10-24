# Data Model

The following is the initial logical model. Exact ORM/schema syntax is implementation-specific.

## User

- id
- created_at
- updated_at
- settings

## ProviderConnection

- id
- user_id
- provider_type
- status
- external_account_id
- created_at
- updated_at
- metadata

Secrets must not be stored in plaintext unless explicitly required by the chosen architecture; prefer secure secret storage.

## LinkedInAccount

- id
- provider_connection_id
- external_id
- display_name
- profile_url
- headline
- snapshot metadata

## Post

- id
- account_id
- external_id
- text
- url
- published_at
- imported_at
- content_type
- source_metadata

## PostMetricSnapshot

- id
- post_id
- observed_at
- impressions
- reactions
- comments
- reposts
- clicks
- other provider metrics

Do not treat unavailable metrics as zero.

## AccountMetricSnapshot

- id
- account_id
- observed_at
- followers
- impressions
- profile_views
- engagement
- other metrics

## Topic

- id
- name
- description

## PostTopic

- post_id
- topic_id
- source
- confidence

## Insight

- id
- account_id
- type
- title
- summary
- evidence
- confidence
- created_at
- model_metadata

## Recommendation

- id
- account_id
- type
- recommendation
- rationale
- evidence
- status
- created_at

## Goal

- id
- account_id
- name
- metric
- target
- start_date
- end_date
- status

## Experiment

- id
- account_id
- name
- hypothesis
- variable
- metric
- baseline
- start_date
- end_date
- result
- conclusion
- status

## ContentPlanItem

- id
- account_id
- title
- concept
- target_topic
- planned_date
- status
- draft

## AIInteraction

- id
- user_id
- provider
- model
- prompt_version
- created_at
- input_reference
- output_reference
- token/cost metadata where available

## Provenance

Important derived records should be traceable to source records and/or source observations.

Avoid a generic JSON-only database. Structured fields should exist for queryable facts; JSON can hold provider-specific extensions.

## As implemented (first release)

The SQLite schema lives in `src/server/infrastructure/db/migrations.ts`. Differences from the
logical model above:

- `accounts` has one row per user (ADR 0015). It holds only display name, headline and profile
  URL.
- `posts.dataset` is `linkedin` or `demo`, so demo data can never be mistaken for real data.
  `posts.time_known` records whether the publish time is real or only a date.
  `posts.providers` lists which adapters contributed to the post.
- `post_metric_snapshots` is keyed by (post, observed day, provider). Re-importing updates the
  row instead of adding one, and a missing value never overwrites a known one. `period_from` and
  `period_to` hold the window the figures cover.
- `account_metric_days` replaces `AccountMetricSnapshot` with one row per day and provider.
  Profile views are not available from any supported source yet, so there is no column for them.
- `audience_segments` stores demographic shares (fractions) per observed day.
- `post_topics.source` is `hashtag` for now (ADR 0015).
- `import_files` keeps the raw uploads and their SHA-256 for retry and audit.
- `jobs` and `audit_log` support background work and security-relevant events.
- `goals`, `experiments` and `plan_items` are the user's own records. "Delete imported data" keeps
  them; deleting the account removes them. Goal progress and experiment results are computed when
  read, never stored, so they always reflect the latest import (ADR 0015 items 5 and 6).
- `ai_credentials` holds sealed keys (ADR 0011). `ai_interactions`, `ai_insights` and
  `recommendations` record AI calls and their grounded output (ADR 0014). Insights and
  recommendations count as derived from imported data, so they are deleted along with it.
- `campaigns` and `content_pillars` are the user's own records and survive "delete imported
  data". `campaign_posts`, `campaign_plan_items` and `campaign_goals` link a campaign to its
  targets with real foreign keys, so deleting a post, plan item or goal drops the link.
- `knowledge_documents`, `post_search` (FTS5) and `post_embeddings` are search indexes rebuilt
  from posts, so the export leaves them out. `theme_runs`, `themes` and `post_themes` hold the
  latest AI theme classification; themes cascade from their run, so wiping a demo run removes
  them.
