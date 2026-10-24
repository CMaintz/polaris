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

## As implemented: analytics and rule insights

- **Reference date.** Periods end at the latest day with imported data ("as of"), not today, so
  an export downloaded last week is not shown as a week of zeros.
- **KPIs** (followers, impressions, engagements, engagement rate, posts published) compare the
  selected period with the equally long one before it. Each KPI states its period, its source and
  how many days in the period had data.
- **Posts published** counts only posts from the data archive (the analytics export lists only
  top posts). Between the first and last archived post a day without posts counts as zero;
  outside that range the count is unknown.
- **Changes** between periods compare the average per day with data, so a period with missing
  days is not read as a drop. The absolute difference is only shown when both periods have the
  same number of days with data. Engagement rate counts only days that report both impressions
  and engagements.
- **Post metrics** fold every observation of a post, oldest first: a later export that omits a
  figure keeps the earlier value.
- **Posting times** shift every timed post by the browser's current UTC offset, so posts from the
  other side of a daylight-saving change land an hour off.
- **Rule insights** run without AI and each carries its evidence:
  - impressions change of at least 10%, reported only when both periods have data for at least
    half their days;
  - the best content type, topic or weekday, when its median engagements are at least 1.2 times
    the overall median, it has enough posts with metrics (3 for types and topics, 2 per weekday),
    and enough groups exist to compare (2, or 3 for weekdays);
  - a post from the last 90 days with at least twice the median engagements, once there are at
    least 5 rated posts;
  - a change of at least 50% in posting frequency (last 28 days against the 28 before, with at
    least 4 earlier posts), only when the archive covers both windows.

## As implemented: strategy

See ADR 0022 and ADR 0023 for the reasoning.

- **Campaigns** have a name, objective, dates, status and notes. They link to posts, plan items
  and goals in the same account. A campaign's posts are the linked posts plus any post a linked
  plan item was published as. Performance compares them with the same number of days just before
  the campaign: posts published, median impressions, median engagement rate and follower change,
  each with how many days had data.
- **Content pillars** are planned recurring themes: a set of hashtag topics and a target share of
  posts (all targets together at most 100%). The actual share and median performance count only
  data-archive posts on days the archive covers. A pillar is under- or over-served when it is more
  than five points off target, and nothing is judged with fewer than five posts.
- **Funnel** shows impressions, then engagements, then new followers, per week or month and per
  campaign window, with engagement rate and new followers per 1,000 impressions over paired days.
  Profile views are not in any supported export, so that stage is always shown as unavailable.

## As implemented: search and themes

See ADR 0017 and ADR 0018.

- **Keyword search** (SQLite FTS5) covers post text and hashtags and needs no AI key. It filters
  by content type, hashtag, theme and dates, and highlights matches. Query punctuation and
  operator words are treated as plain words.
- **Meaning search** embeds posts with the user's own OpenAI key and ranks keyword and meaning
  matches together. With an Anthropic-only key, or before indexing, it falls back to keywords and
  says so. Indexing re-embeds only posts whose text changed and runs after every import.
- **Themes**: the AI groups up to the 150 newest posts into at most eight themes, kept apart from
  hashtag topics. Ids the model invents are dropped. Each theme shows median performance, and
  emerging themes compare the share of posts in the latest 90 covered days with the 90 before.
- **Ask retrieval** (section 9 step 3): up to four posts that match the question are added to the
  evidence, fenced like all post text, with the reason they matched.

## As implemented: external intelligence

See ADR 0019, ADR 0020 and ADR 0021.

- **Research**: the user asks a question, optionally about a peer, and a background job answers
  it with their own provider's server-side web search (LinkedIn itself is excluded). A second
  call turns the notes into a report: summary, findings with sources, how it relates to the
  user's topics and top posts, and caveats. Findings that cite no returned source are dropped,
  and only http(s) URLs become links.
- **Peers** are a watchlist of names, profile links and notes. Polaris never fetches the profile.
- **Trend feeds**: the user adds RSS or Atom feeds, fetched by the server behind an SSRF guard.
  Items are matched to the account's hashtag topics by keywords, counted over 7, 30 and 90
  days. A digest can add an AI summary of how recent items relate to the user's content.
- **Schedules** run feed refreshes, trend digests, a weekly account review or a research rerun,
  daily or weekly. The job worker checks for due schedules on every poll, and a missed period
  costs one catch-up run, not one per period.

## As implemented: drafting, approvals and publishing

See ADR 0024 and ADR 0025.

- **Drafts** are versioned: every save, AI draft or restore adds a version. A draft can link to a
  plan item in the same account. Text over LinkedIn's 3,000-character limit is flagged and cannot
  be approved or scheduled.
- **AI drafting** writes a draft or a rewrite from a brief (topic, angle, tone), using the
  account's best posts as voice examples. The result is always a new version, never a post.
- **Approval** belongs to one version: any later save drops it. Only an approved draft can be
  scheduled.
- **Proposals** are how AI suggests changes (docs/06): plan items, experiments and goals sit
  pending until the user approves or rejects them. Approving applies a proposal once, however
  often it is clicked, and a rejected proposal can never be applied. Every decision is in the
  audit log.
- **Agentic planning** asks the model for a plan for the next one to eight weeks. Every
  suggestion becomes a pending proposal with its rationale and cited evidence; suggestions with
  no real evidence, or dated outside the window, are dropped.
- **Publishing** runs when a scheduled draft is due. The manual provider prepares the text and a
  share link and waits for the user to confirm they posted it. The LinkedIn provider posts
  through the official Posts API on the user's own LinkedIn app connection. A post is attempted
  at most once: an interrupted attempt asks the user to check rather than posting again.

## As implemented: multiple accounts

See ADR 0026.

- **Accounts.** A user can add accounts (a platform, LinkedIn or Other, and a name), rename them
  and delete one with the password; deleting removes that account's data. The sidebar switcher
  picks the active account, and every page then shows that account's data.
- **Imports** go into the active account. The import screen names it and lists the file kinds
  that fit its platform; a file for another platform is refused. Accounts of platform Other
  import a generic posts CSV (docs/07).
- **Compare accounts** (Intelligence) shows each account's followers, impressions, engagements,
  engagement rate and posts published over one shared period, with coverage. Missing data shows
  as "Not available", never zero.
- **Planner** has an "All accounts" view: every account's plan items with their account, by
  planned date. It is read-only; items are edited in their own account.
- **Your data.** The export covers every account. "Delete imported data" clears every account's
  imported data and keeps the accounts and the user's own records.
