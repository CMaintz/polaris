# Project Polaris

A self-hosted LinkedIn intelligence and decision-support dashboard. Import your own LinkedIn
data exports, see how your content performs over time, and get evidence-backed AI reviews using
your own OpenAI or Anthropic key.

- **Overview**: KPIs with period, source and coverage; trends; rule-based insights with evidence.
- **Content**: every post, filterable and sortable, with full measurement history per post.
- **Analytics and audience**: trends by day, week or month; performance by content type, topic,
  weekday and hour; audience demographics.
- **AI insights** (bring your own key): account and post reviews and questions about your data.
  The model may only cite Polaris' own numbered evidence.
- **Search and themes**: keyword search with no key needed, meaning search on an OpenAI key, and
  AI-found content themes with their performance and which ones are emerging.
- **Research and trends**: web research with sources on your own provider, a watchlist of
  peers, RSS and Atom feeds matched to your topics, and scheduled digests and reviews.
- **Strategy**: goals, experiments, content pillars against what you actually post, campaigns
  measured against the period before them, and an impressions-to-followers funnel.
- **Planner, Studio and approvals**: plan posts, write and version drafts (with AI if you like),
  approve them, and schedule them. AI suggestions wait for your approval; nothing is posted until
  you approve and schedule it, by hand or through your own LinkedIn app.
- **Several accounts**: keep one account per profile or platform, import a generic CSV for
  platforms other than LinkedIn, and compare accounts side by side.
- **Your data**: export everything as JSON, delete imported data, or delete the account.

## Run it

Requires [mise](https://mise.jdx.dev) (it provides the pinned Node version).

```bash
mise install          # Node and the quality-gate tooling
npm ci
npm run build         # builds the web app into dist/web
npm start             # serves the API and the app on http://127.0.0.1:4480
```

Open the app and create the first account. Only the first account can register unless
`POLARIS_ALLOW_SIGNUP=true`. Then go to **Settings** and either import your LinkedIn exports or
load the demo data to look around.

For development, `npm run dev` runs the API with reload on port 4480 and the Vite dev server on
http://127.0.0.1:4481.

Configuration is through environment variables; see [`.env.example`](./.env.example). For access
from other devices, keep Polaris bound to `127.0.0.1` behind a TLS reverse proxy and set
`POLARIS_SECURE_COOKIES=true`. Back up the data directory (database and `master.key`, if you have
not set `POLARIS_MASTER_KEY`): stored AI keys cannot be decrypted without the master key.
To scrape metrics with Prometheus, set `POLARIS_METRICS_TOKEN` and send it as a Bearer token to
`/api/metrics`.

## Getting your LinkedIn data

1. **Posts**: LinkedIn, Settings, Data privacy, Get a copy of your data. Upload the ZIP, or
   `Shares.csv` and `Profile.csv` from it.
2. **Metrics and audience**: your post analytics, Export. Upload the `.xlsx` file.

Re-importing is safe: nothing is duplicated and newer figures are added to each post's history.
For other platforms, upload a CSV with `date` and `text` columns (and optionally `url`,
`type`, `impressions`, `reactions`, `comments`, `reposts`, `engagements`, `hashtags`)
into an account of platform "other".

## Posting to LinkedIn

Polaris never posts on its own. To post an approved, scheduled draft through LinkedIn's official
API, create a LinkedIn app with "Share on LinkedIn" and "Sign In with LinkedIn using OpenID
Connect", set the `POLARIS_LINKEDIN_*` variables from `.env.example`, and connect it in
Settings. Without an app, Studio prepares the text and a share link for you to post by hand.
The export formats are assumed rather than documented by LinkedIn; see
[ADR 0010](./adr/0010-linkedin-data-acquisition.md).

## Quality gate

The repo follows the [Foundry](https://github.com/CMaintz/foundry) verbs: `mise run gate` runs
lint, typecheck, tests with a coverage floor, and the dependency audit. CI runs the same gate
plus secret scanning and SAST.

## Documentation

Product and architecture documentation lives in [`PROJECT.md`](./PROJECT.md),
[`docs/`](./docs/MANIFEST.md) and [`adr/`](./adr/). Decisions taken while building, which are
still awaiting product review, are the ADRs marked **Proposed** (0006 to 0027). ADR 0027 maps
every roadmap phase to its ADRs and lists what has only been tested against fakes.
