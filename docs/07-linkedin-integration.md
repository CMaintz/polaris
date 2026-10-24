# LinkedIn Integration

## Integration principle

LinkedIn is a provider, not the domain model.

The application should define an internal interface such as:

- authenticate/connect
- fetch profile
- fetch posts
- fetch metrics
- fetch audience/account metrics
- publish (future)
- refresh

The implementation can use an official API where available and permitted, or browser automation where appropriate and legally/technically viable.

## Browser automation boundary

If Playwright is used:

```text
LinkedInProvider
    |
    +--> LinkedInApiAdapter
    |
    +--> LinkedInBrowserAdapter
```

Both produce the same normalized domain objects.

## Import strategy

Imports should support:

- initial full import
- incremental refresh
- retry
- deduplication
- historical metric snapshots

## Identity

External LinkedIn IDs must be retained where available so imports can be idempotent.

## Terms and operational constraints

Any LinkedIn automation must be implemented only in ways permitted by the applicable LinkedIn terms, APIs and user authorization model.

Do not make the core architecture depend on bypassing access controls or anti-automation mechanisms.

## Data normalization

Provider-specific names must be normalized at the integration boundary.

For example:

`LinkedInProviderMetric.impressions` -> `PostMetricSnapshot.impressions`

The domain should not contain LinkedIn-specific field names where a generic concept exists.

## Implemented adapters

See ADR 0010 for the decision and the assumed file layouts.

| Provider id                 | Reads                                                        | Produces                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `linkedin-data-export`      | the member data archive ZIP, or `Shares.csv` / `Profile.csv` | posts (text, date and time, link, media type), profile name and headline                                                                                             |
| `linkedin-analytics-export` | the creator analytics `.xlsx`                                | per-post engagements and impressions for the export window, daily impressions, engagements, new followers and back-calculated follower totals, audience demographics |
| `demo`                      | nothing (generated)                                          | a labelled synthetic dataset (ADR 0015)                                                                                                                              |
| `generic-csv`               | a platform-neutral posts `.csv` (accounts of platform Other) | posts (text, date or date and time, link, type, hashtags) and per-post impressions, reactions, comments, reposts and engagements as of the import day                |

Both LinkedIn adapters identify a post by the URN in its URL, decoded first, so the URL-encoded
form in `Shares.csv` and the plain form in the analytics export match. Every stored post lists
the providers that contributed to it, and every metric snapshot records its provider, observed
day, covered period and import job.

## As implemented: multiple accounts and platforms

See ADR 0026. Each provider declares the one platform it serves, and an import goes into the
account that was active when it started. The LinkedIn adapters and the demo dataset fit only
LinkedIn accounts; `generic-csv` fits only accounts of platform Other. A file that does not fit
is refused before anything is queued, naming the file and the account.

The generic CSV needs a header row with `date` and `text`; `url`, `type`, `impressions`,
`reactions`, `comments`, `reposts`, `engagements` and `hashtags` are optional. Headers are
matched case-insensitively and by aliases (ADR 0026 lists them). A post is identified by its
URL, or by a hash of its date and text when it has none, so re-imports never duplicate. The file
counts as the complete list of posts for the days it covers.

## Publishing

`publish` is implemented through the official Posts API with the member's own consent
(three-legged OAuth, `w_member_social`), configured with the self-hoster's LinkedIn app. The
assumed endpoint shapes are listed in ADR 0025; they have not been exercised against LinkedIn.
Without a configured app, Polaris offers only manual posting: copyable text and a share link.
