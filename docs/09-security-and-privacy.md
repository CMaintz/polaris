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
