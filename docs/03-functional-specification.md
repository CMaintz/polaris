# Functional Specification

## 1. Dashboard

The dashboard is the operational home screen.

It should answer:

- How is the account doing?
- What changed recently?
- Which content matters?
- What deserves attention?
- What should the user investigate?

Suggested sections:

- KPI summary
- performance trend
- recent posts
- top/bottom content
- emerging themes
- AI insight cards
- active goals
- active experiments

## 2. Content explorer

Capabilities:

- table/list view
- search
- filters
- sorting
- date ranges
- content type
- topic
- performance bands
- individual post detail

## 3. Post detail

Show:

- original content
- publication metadata
- metrics
- engagement breakdown
- historical context
- comparable posts
- AI analysis
- detected topics
- recommendations
- provenance

## 4. Analytics

The analytics layer should support:

- daily/weekly/monthly aggregation
- growth calculations
- rolling averages
- comparisons between periods
- segmentation
- content cohort analysis

Metrics must always identify their source and measurement period.

## 5. AI review

A review should be structured rather than a single free-form paragraph.

Example:

- observation
- evidence
- interpretation
- confidence/uncertainty
- possible action
- expected signal to monitor

## 6. Content planning

Users can create:

- ideas
- drafts
- planned posts
- recurring themes
- content goals

Planning is not the same as publishing.

## 7. Experiments

An experiment contains:

- hypothesis
- baseline
- variable
- planned duration/sample
- success metric
- result
- conclusion
- follow-up

The system should avoid claiming statistical significance unless the available data actually supports it.

## 8. Goals

Goals should support:

- metric
- target
- timeframe
- current value
- progress
- notes
- related experiments

## 9. Natural-language analysis

Users should be able to ask questions against their own Polaris dataset.

The system should:

1. classify the question
2. retrieve relevant structured data
3. optionally retrieve semantic/contextual data
4. generate an answer
5. cite or expose the underlying evidence

The model must not receive unrestricted database access.

## 10. Import/sync

Imports should:

- be resumable
- be idempotent
- record source timestamps
- record failures
- expose progress
- preserve provenance
