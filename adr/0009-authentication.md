# ADR 0009 - Authentication: Local Accounts with Server-Side Sessions

Status: Proposed (assumed by the implementing agent on 2026-10-23; awaiting product review)

Resolves: OD-003

## Decision

- Email and password accounts. Passwords are hashed with scrypt (built into Node) and a per-user
  salt.
- Sessions are random 256-bit tokens in an `HttpOnly`, `SameSite=Lax` cookie. Only a SHA-256
  hash of the token is stored, so a database leak does not expose live sessions. Sessions expire
  after 30 days.
- An Origin check protects mutating requests against CSRF.
- The first account can always register. Later sign-ups are refused unless
  `POLARIS_ALLOW_SIGNUP=true`, so a self-hosted instance is not open to strangers by default.
- Every repository query is scoped to the owning user (the "user/account boundary" from
  HANDOFF.md). A test proves one user cannot read another user's data.

## Alternatives considered

- Passkeys or OAuth/social login: better UX, but they need a public origin and provider setup
  that a self-hosted install may not have. Good candidates for later.
- No auth (single user, trust the network): unsafe once the instance is reachable remotely,
  which is the point of moving to the web.
