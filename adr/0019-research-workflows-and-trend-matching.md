# ADR 0019 - Research Workflows and Trend Matching

Status: Proposed (assumed by the implementing agent, awaiting owner review)

docs/01 asks how external events relate to the user's content, and docs/11 phase 5 lists
research workflows, trends and external context. The docs do not say how. This records the
assumptions.

## Decision

- **Research runs in two model calls.** First the user's own provider answers the question
  with its server-side web search tool (`WebResearchProvider` port: Anthropic
  `web_search_20260318`, the newest type in `@anthropic-ai/sdk` 1.2.0; OpenAI Responses API
  `web_search`). It returns plain notes plus the sources the search returned or the model
  cited. Then the existing `AiProvider.generateStructured` turns the notes into a report
  (summary, findings with source ids, relation to the user's topics and top posts, caveats).
  One combined call was rejected: whether Anthropic accepts web search citations together
  with `output_config.format` is not settled, and two calls keep both adapters thin and the
  structuring step provider-neutral. Both calls are recorded in `ai_interactions` with
  versioned prompts (`research-search/v1`, `research-report/v1`).
- **Grounding.** Sources are numbered by Polaris (S1, S2, ...). A finding that cites no
  returned source is dropped and counted in the caveats; topics and post ids outside the
  account's own are dropped. Only http(s) source URLs are ever links.
- **Untrusted text.** The question, peer notes, web notes and post text reach prompts only
  through `fenced` / `inlineText`. Model output is stored and rendered as plain text.
- **Peers** are records the user types (name, profile URL, notes). Polaris never fetches the
  profile URL, and the Anthropic search tool blocks `linkedin.com` (docs/07, ADR 0010).
- **Trend matching is deterministic keyword overlap.** An item matches a topic when the
  lower-cased topic equals a word, or 2 to 3 adjacent words joined, in its title or summary
  (so "Product Engineering" matches `#productengineering`). Topics are the account's
  hashtags (ADR 0015). Topics shorter than 2 characters are ignored.
- **Trend score** is the count of matched items per topic in the trailing 7, 30 and 90 days,
  by publish day (fetch day when the feed gives none, or a future date). The UI says from
  when Polaris has tracked feeds, since earlier windows undercount.
- **Digest.** A digest job takes the last 7 days of matches. The optional AI summary fences
  each item and cites it by a Polaris id; if it fails, the keyword digest is still saved.

## Consequences

- A research run costs two model calls on the user's key, and web search is billed by the
  provider.
- Keyword matching misses synonyms; semantic matching can replace the function in
  `domain/trends.ts` later without touching storage.
