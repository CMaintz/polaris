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
