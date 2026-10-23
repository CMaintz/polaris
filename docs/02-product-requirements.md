# Product Requirements

## MVP capabilities

### Account

- Connect/import LinkedIn data
- Show profile/account overview
- Track account-level metrics
- Maintain historical snapshots

### Content

- Import posts
- Store post metadata and performance metrics
- Search/filter posts
- Compare posts
- Analyse individual posts
- Analyse groups of posts
- Identify recurring content themes

### Analytics

- Time-series performance
- Engagement breakdowns
- Content-type comparisons
- Topic/theme performance
- Posting-time analysis
- Growth trends
- Basic audience signals

### AI intelligence

- Natural-language account review
- Post review
- Content pattern analysis
- Recommendations grounded in evidence
- Ask questions about the user's own data
- Structured insights

### Planning

- Content ideas
- Content calendar
- Goals
- Experiments
- Hypotheses
- Result tracking

## Later capabilities

- External trend intelligence
- Competitor/context research
- Semantic search
- Funnel analysis
- Campaign management
- Agentic workflows
- Multi-platform support

## Functional quality requirements

- Data must remain internally consistent.
- Analytics must distinguish missing data from zero.
- AI must not invent source metrics.
- Imports must be idempotent.
- Provider failures must be recoverable.
- Long-running imports must expose status.
- User actions must be auditable where appropriate.
