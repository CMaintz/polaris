# ADR 0018 - AI Content Themes, Stored Apart From Hashtag Topics

Status: Proposed (assumed by the implementing agent, awaiting owner review)

Refines: ADR 0015 item 2 (topics come from hashtags) and ADR 0014 "not yet done: AI topic
extraction".

## Decision

- **Themes get their own tables** (`themes`, `post_themes`, `theme_runs`), not `post_topics`
  with a new `source`. Every reader of `post_topics` today reads all sources:
  - the posts read model folds them into `PostRecord.topics`;
  - those feed the Content page's hashtag filter, the topic breakdowns and the AI evidence
    packs (as `#name`);
  - the import's cleanup prunes topics by them.

  Theme names in `post_topics` would show up as hashtags in all of those places and collide
  with real hashtags of the same name. Theme names are also model output with spaces, while
  topic names are restricted to word characters so they are safe in prompts.

- **One job classifies, and a run replaces the last one.** `knowledge-themes` sends up to
  the 150 most recent posts with text, each cut to 400 characters and fenced as untrusted
  `<post_text>`. It asks for 3 to 8 themes through `generateStructured` with the versioned
  prompt `content-themes/v1`. The account's themes are then replaced in one transaction, so
  a rerun never mixes two classifications. Older posts beyond the cap stay unclassified, and
  the page says how many were classified.
- **Themes never claim a post that does not exist.** The prompt uses short ids (`P1`...).
  Ids the prompt did not contain are dropped, and so is a theme left with no posts. Theme
  names that differ only in case or spacing are merged. The store inserts a post link only
  for a post of the same account.
- **Theme performance** reuses the domain's segment grouping: median impressions,
  engagements and engagement rate per theme, over the posts with metrics. A post can be in
  two themes and counts in both.
- **Emerging themes** compare each theme's share of posts in the latest 90 days against the
  90 days before.
  - The windows end at the last day the imports cover, and their covered days are clipped to
    the measurable range of `postCountCoverage`.
  - Only classified posts from sources that list every post count. A top-posts export would
    make one theme look like all of the account's output.
  - A window with fewer than 3 such posts has no share, and the trend is then "not enough
    posts", never a jump from zero.
  - A change of 10 percentage points or more is "emerging" or "fading". The UI says this is
    a description, not a statistical test.
- Themes are AI interpretation: they are labelled as such, carry the provider, model and
  prompt version, and are tagged when based on demo data.

## Not yet done

Classifying more posts than the cap (it would need a second pass that assigns posts to
fixed themes), editing or renaming themes by hand, and theme history across runs.
