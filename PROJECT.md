# Project Polaris - Project Brief

## One-line definition

A web application that turns a user's LinkedIn data, content, audience signals and external intelligence into useful analysis, recommendations and eventually controlled automation.

## Product thesis

LinkedIn exposes a large amount of information but leaves the user to manually interpret it. Polaris should create an intelligence layer between raw LinkedIn activity and the user's decisions.

The core loop is:

**Collect → Normalize → Understand → Explain → Recommend → Act → Measure → Learn**

The product should not merely produce generic AI content. It should understand the user's actual account, historical performance, audience, content and goals.

## Product evolution

### Phase A - LinkedIn intelligence assistant

The initial product focuses on:

- account/profile overview
- post and content analytics
- audience analytics
- performance trends
- content analysis
- AI-assisted interpretation
- recommendations
- content planning
- goals and progress
- experiments

### Phase B - Growth operating system

Expand into:

- content strategy
- recurring planning
- campaign management
- funnel analysis
- semantic search
- external trend intelligence
- competitive/contextual research
- experiment management
- deeper audience modelling

### Phase C - Controlled autonomous growth platform

Potential future capabilities:

- agent-driven planning
- agent-generated content drafts
- automated analysis cycles
- experiment execution
- action proposals
- review/approval workflows
- multi-platform providers

Automation must remain explainable and user-controlled.

## Non-goals for the initial release

- Building a generic social network
- Becoming a general-purpose CRM
- Replacing the user as final decision maker
- Building a hidden engagement bot
- Hard-coding the application around one LLM provider
- Requiring a proprietary hosted AI model
- Designing the core domain around one scraping implementation

## Important historical decisions

The project originally leaned toward a local Windows/macOS application to avoid hosting costs and keep user data local. The product direction has now changed to a **web application** because cross-device access is more valuable.

The earlier principles remain useful:

- BYOK
- privacy-first design
- provider abstractions
- SQLite as the initial persistence technology
- LinkedIn-first domain model
- extensibility
- explainable AI
- local/user-owned data where practical

The web architecture therefore needs to preserve the spirit of the original local-first design rather than becoming a data-hungry SaaS by default.
