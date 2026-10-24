# ADR 0017 - Search: SQLite FTS5 Plus Embeddings Stored in SQLite

Status: Proposed (assumed by the implementing agent, awaiting owner review)

Supersedes: ADR 0013. Resolves: OD-008.

## Decision

- **Keyword search always works.** It uses SQLite FTS5 (`unicode61`, diacritics removed)
  over post text and hashtags, so it needs no AI key. The index syncs itself at the start of
  every search and status call: a hash of each post's text and hashtags decides which rows to
  rewrite, so an import is searchable at once and no job has to run first. Deleting a post
  removes it from the index through a cascade and a trigger.
- **Query input is never FTS syntax.** The query is split into letters and digits, and each
  word is sent as a quoted prefix term (`"pric"*`). Operators, quotes and column filters in
  the input become plain words. The search box needs every word; context retrieval for Ask
  takes any content word, with a short stopword list.
- **Snippets are plain text.** FTS5 marks matches with private-use characters, which are
  stripped from post text when it is indexed. The server splits snippets into
  `{ text, hit }` segments, and the web client renders them as React text with `<mark>`. No
  HTML from a post reaches the page.
- **Meaning search uses OpenAI `text-embedding-3-small` on the user's active OpenAI key.**
  Anthropic has no embeddings API, so with an Anthropic key, or no key, the UI says so and
  keyword search runs instead. A stored OpenAI key that is not active is not used: one
  active key decides where data goes (docs/09).
- **Vectors live in SQLite** (`post_embeddings`, float32 BLOB) and cosine similarity runs
  in JS. A personal account has hundreds to a few thousand posts, which is a millisecond
  scan. There is no vector database (OD-008).
- **Indexing is a background job** (`knowledge-index`, the docs/04 "embedding/indexing"
  category). It embeds only posts whose text hash or model changed, in batches of 64, and
  drops vectors for posts without text. Running it twice sends nothing the second time.
- **Every embedding call is recorded** in `ai_interactions`: `post-embedding/v1` for
  indexing and `query-embedding/v1` for a search. The record holds counts, never the vectors
  or the query. The versions name the input format: readable post text, at most 8000
  characters.
- **Hybrid ranking uses reciprocal rank fusion** (k = 60) over the keyword and meaning
  rankings. Fusing ranks avoids normalising bm25 (unbounded) against cosine (bounded).
  Meaning hits need a similarity of at least 0.3. Unrelated English text scores about 0.1 to
  0.2 on this model, so this floor is a guess to revisit with real data.
- If a meaning search fails (rate limit, outage), the search falls back to keywords with a
  notice. It does not fail.

## Consequences

- Each meaning search sends the query to OpenAI, so the web client submits on demand, never
  per keystroke.
- Changing the embedding model re-embeds every post on the next index run.
- On PostgreSQL, `post_embeddings` maps to pgvector and FTS5 maps to `tsvector`. The ports
  (`KeywordIndex`, `VectorStore`) stay the same.
