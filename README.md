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
- **Planner, goals and experiments**: plan posts, track goals against measured data, and run
  simple before-and-after experiments.
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

## Getting your LinkedIn data

1. **Posts**: LinkedIn, Settings, Data privacy, Get a copy of your data. Upload the ZIP, or
   `Shares.csv` and `Profile.csv` from it.
2. **Metrics and audience**: your post analytics, Export. Upload the `.xlsx` file.

Re-importing is safe: nothing is duplicated and newer figures are added to each post's history.
The export formats are assumed rather than documented by LinkedIn; see
[ADR 0010](./adr/0010-linkedin-data-acquisition.md).

## Quality gate

The repo follows the [Foundry](https://github.com/CMaintz/foundry) verbs: `mise run gate` runs
lint, typecheck, tests with a coverage floor, and the dependency audit. CI runs the same gate
plus secret scanning and SAST.

## Documentation

Product and architecture documentation lives in [`PROJECT.md`](./PROJECT.md),
[`docs/`](./docs/MANIFEST.md) and [`adr/`](./adr/). Decisions taken while building the first
version, which are still awaiting product review, are the ADRs marked **Proposed** (0006 to 0016).
