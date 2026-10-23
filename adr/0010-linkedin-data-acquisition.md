# ADR 0010 - LinkedIn Data Acquisition: User-Uploaded Official Exports

Status: Proposed (assumed by the implementing agent on 2026-10-23; awaiting product review)

Resolves: OD-004

## Context

LinkedIn restricts its APIs for personal-profile post analytics to approved partners. Browser
automation of linkedin.com conflicts with LinkedIn's User Agreement and its anti-automation
controls, and docs/07 forbids depending on bypassing them. LinkedIn does give every member two
official, user-authorised exports.

## Decision

The first `LinkedInProvider` implementation reads files that the user downloads from LinkedIn
and uploads to Polaris:

1. **Member data archive** (Settings > Data privacy > Get a copy of your data), either as the
   ZIP or as individual CSVs. Polaris uses `Shares.csv` (post text, date, link, media) and
   `Profile.csv` (name and headline only). Birth date, address and similar fields are
   deliberately not stored.
2. **Creator analytics export** (Analytics > Export, `.xlsx`). Polaris uses these sheets:
   `ENGAGEMENT` (daily impressions and engagements), `FOLLOWERS` (total and daily new
   followers), `TOP POSTS` (per-post engagements and impressions) and `DEMOGRAPHICS` (audience
   breakdown).

### Assumed file formats (not checked against a real export)

LinkedIn does not publish these formats. Headers are matched case-insensitively and by aliases.
Unknown columns are kept in `source_metadata`, not dropped.

- `Shares.csv`: `Date, ShareLink, ShareCommentary, SharedUrl, MediaUrl, Visibility`.
- `Profile.csv`: `First Name, Last Name, Headline` (other columns are ignored).
- Analytics `TOP POSTS`: two side-by-side tables under a title row,
  `Post URL, Post publish date, Engagements` and `Post URL, Post publish date, Impressions`.
- Analytics `ENGAGEMENT`: `Date, Impressions, Engagements`.
- Analytics `FOLLOWERS`: a "Total followers on <date>" line, then `Date, New followers`.
- Analytics `DEMOGRAPHICS`: `Top Demographics, Value, Percentage`.

Dates are accepted as Excel dates, `M/D/YYYY` or ISO strings. If a real export differs, only the
adapter's header aliases need to change. Imports report sheets they do not recognise as warnings.

### Identity and idempotency

- A post's external id is the numeric id in its LinkedIn URN (`urn:li:activity:N`,
  `urn:li:share:N` or `urn:li:ugcPost:N`), taken from the post URL.
- Re-importing a file creates no duplicates. Posts upsert on (account, external id); metric
  snapshots upsert on (post, observed day, provider).
- **Assumption:** the archive and the analytics export use the same URN for a post. Where they
  do not, the analytics-only post is stored as "text unavailable" until a matching archive
  import arrives. Polaris does not guess matches by date, because a wrong guess would attach
  metrics to the wrong post.
- The per-post figures in `TOP POSTS` cover the export's date range, not the post's lifetime.
  The range is recorded on each snapshot.

### Derived follower totals

The `FOLLOWERS` sheet states one total and a daily count of new followers. Polaris
back-calculates the total for each earlier day: the total at the end of day D is the stated
total minus the new followers gained after D. This **assumes** the stated total is an end-of-day
figure that includes that day's gains. A day with no new-follower count makes every earlier
total unknown rather than guessed. If LinkedIn's total turns out to be start-of-day, every
derived total is off by one day's gain.

## Consequences

- Data is only as fresh as the user's last export. The import screen explains this.
- `Shares.csv` has no metrics, so posts outside the analytics export's top 50 have none. The UI
  shows "not available", never zero.
- An official API adapter or an automation adapter can be added later behind the same provider
  port, with no change to the domain.
