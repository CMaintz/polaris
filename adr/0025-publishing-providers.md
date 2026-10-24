# ADR 0025 - Scheduling and Publishing Providers

Status: Proposed (assumed by the implementing agent on 2026-10-24; awaiting owner review)

This supersedes ADR 0015 item 11 ("Polaris never posts to LinkedIn"). docs/11 phase 6 and
docs/14 now ask for optional publishing providers. docs/07 limits publishing to an official
API.

## Decision

1. **A `PublishingProvider` port** with `id`, `mode` and `connectionStatus(accountId)`, plus
   `publish(accountId, text)`, which returns `{ externalId, url }`. There are two adapters:
   - `manual` (mode `handoff`): needs no connection. At the scheduled time the post becomes
     "ready for you to post". The page shows the text to copy and a LinkedIn link that opens
     the composer prefilled with it. The user then confirms "I published it" and may paste the
     post's link. Only `https://*.linkedin.com` links are accepted, so a pasted `javascript:`
     URL can never render as a link.
   - `linkedin-api` (mode `api`): posts through the official Posts API, described below.
2. **Only approved, connected and due drafts are published.** The job checks this again when
   it runs. A post whose connection lapsed fails with "reconnect"; Polaris never quietly skips
   it.
3. **At most once.** A publication moves `scheduled -> publishing` in one compare-and-set
   before the provider is called. If a job finds a publication already `publishing`, an
   earlier attempt crashed after calling LinkedIn. That job marks it failed with "may or may
   not have published, check your profile" and never posts again. A 4xx response means
   nothing was posted. A 5xx, timeout or reset is treated as unknown. A failed post is never
   retried automatically; the user schedules it again. Each draft can have at most one open
   publication (a partial unique index).
4. **Due time.** `JobRepository.enqueue` has no due time, so `PublishingService.enqueueDue(now)`
   is called from the scheduler tick. Each publication is marked queued in one statement, so
   two ticks cannot enqueue it twice.
5. **Tokens** are sealed with `SecretBox`. The context `publishing:linkedin-api:<accountId>`
   ties each token to its account. A token is never returned by the API.
6. **Disconnect deletes the stored token.** LinkedIn documents no token-revocation endpoint
   for this flow, so Polaris tells the user they can also remove the app under LinkedIn's
   "Permitted services". LinkedIn gives most apps no refresh token and tokens last 60 days.
   After that the status is "expired" and the user must reconnect.
7. **OAuth `state`** is 32 random bytes. Only its SHA-256 is stored, with the user, the account
   and a 10-minute expiry. It works once (delete-returning). The callback checks that it
   belongs to the signed-in user, which defeats both CSRF and code injection. The callback is a
   GET that needs the session cookie; the cookie is `SameSite=Lax`, so LinkedIn's top-level
   redirect carries it.

## LinkedIn endpoint shapes assumed (not exercised live)

None of this has been run against LinkedIn. It needs an app with the "Share on LinkedIn" and
"Sign In with LinkedIn using OpenID Connect" products. The adapter is unit-tested against a
fake `fetch` only.

- Authorize: `GET https://www.linkedin.com/oauth/v2/authorization` with `response_type=code`,
  `client_id`, `redirect_uri`, `state` and `scope=openid profile w_member_social`
  ([authorization code flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow)).
- Token: `POST https://www.linkedin.com/oauth/v2/accessToken`, form-encoded, with
  `grant_type=authorization_code`, `code`, `client_id`, `client_secret` and `redirect_uri`.
  The response has `access_token` and `expires_in` in seconds (same page).
- Member id: `GET https://api.linkedin.com/v2/userinfo` with the bearer token. Its `sub` gives
  the author URN `urn:li:person:{sub}`, and `name` is shown as the connection
  ([OpenID Connect](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2)).
  Using `sub` as the person id is an assumption. LinkedIn's share guide says to get the person
  URN this way but shows no example.
- Post: `POST https://api.linkedin.com/rest/posts` with the headers `Linkedin-Version: YYYYMM`
  (configurable, default `202610`) and `X-Restli-Protocol-Version: 2.0.0`. The body is
  `{ author, commentary, visibility: "PUBLIC", distribution: { feedDistribution: "MAIN_FEED",
targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: "PUBLISHED",
isReshareDisabledByAuthor: false }`. A success is `201`, with the post URN in the
  `x-restli-id` header. The post link is `https://www.linkedin.com/feed/update/{urn}/`
  ([Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api)).
  The Posts API page is under Marketing and its examples use organization authors. Whether
  `w_member_social` alone allows posting there as a person, rather than through the older
  `/v2/ugcPosts`, is an assumption.
- `commentary` is "little" text. The characters `| { } @ [ ] ( ) < > # \ * _ ~` are
  backslash-escaped, except a `#` that starts a word, so hashtags stay hashtags
  ([little text format](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/little-text-format)).
  Whether the 3,000 limit counts the escaped or the plain text is unknown.
- The manual share link `https://www.linkedin.com/feed/?shareActive=true&text=...` is not a
  documented API. It is offered only next to the copyable text.

## Not done

Only text posts are supported (no images, documents or mentions), posts cannot be edited or
deleted after publishing, and nothing links a published post to the post record from a later
import.

A publication is marked queued before its job is enqueued. If that job is lost (enqueue fails,
or the job uses up its retry on a non-permanent error before posting starts), the post stays
"Scheduled" forever. Today the only way out is to cancel it and schedule it again. A sweep that
releases stale queued marks would fix this.
