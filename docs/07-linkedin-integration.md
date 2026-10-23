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

Both LinkedIn adapters identify a post by the URN in its URL, decoded first, so the URL-encoded
form in `Shares.csv` and the plain form in the analytics export match. Every stored post lists
the providers that contributed to it, and every metric snapshot records its provider, observed
day, covered period and import job.
