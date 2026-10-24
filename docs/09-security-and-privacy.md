# Security and Privacy

## Principles

- Minimize retained personal data.
- Encrypt data in transit.
- Protect API keys.
- Separate credentials from application data.
- Make integrations revocable.
- Log security-relevant events without logging secrets.
- Provide deletion/export capabilities.

## API keys

Never:

- put provider keys in frontend source
- log full keys
- persist keys in ordinary application tables without a deliberate encryption strategy
- include keys in AI prompts

## LinkedIn credentials

Polaris should not ask users to provide passwords directly unless a future architecture explicitly requires it and the security/legal implications are addressed.

Prefer official authorization flows where available.

## Data lifecycle

Users should eventually be able to:

- inspect connected sources
- export their data
- delete imported data
- disconnect providers
- delete the account

## AI privacy

Before sending data to an AI provider, the system should know:

- what data is being sent
- why it is needed
- which provider receives it
- whether the provider retains it

## Threat model

Consider:

- credential theft
- session theft
- malicious imported content
- prompt injection from external/social content
- cross-user data leakage
- unauthorized background jobs
- insecure browser sessions

Social content must be treated as untrusted input. A LinkedIn post containing instructions such as "ignore previous instructions" is data, not an instruction to the Polaris agent.

## As implemented: server-side fetching

Trend feeds are the only URLs the server fetches for a user (ADR 0020):

- https only, unless `POLARIS_FEEDS_ALLOW_HTTP` is set;
- every resolved address must be public (loopback, private, link-local, CGNAT, multicast and
  translation ranges are refused), and the connection is pinned to the vetted address so DNS
  rebinding cannot redirect it;
- each of up to three redirects is vetted again; 10 second timeout, 2 MB cap, feed content
  types only;
- the XML reader refuses any DOCTYPE, so no entity is ever expanded.

Feed text, web search notes and model output are untrusted: they are fenced in prompts and
rendered as plain text.

## As implemented: publishing connections

LinkedIn access tokens are sealed with the same AES-GCM key as AI keys, bound to their account,
and never returned or exported. The OAuth `state` is single-use, bound to the user and stored
only as a hash. Disconnect deletes the token; LinkedIn documents no revocation endpoint, so the
member can also revoke the app from their LinkedIn settings.
