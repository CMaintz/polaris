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
