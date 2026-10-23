# ADR 0011 - BYOK Secret Storage: AES-256-GCM at Rest with a Server Master Key

Status: Proposed (assumed by the implementing agent on 2026-10-23; awaiting product review)

Resolves: OD-006. Implements ADR 0004.

## Decision

- User AI keys (OpenAI, Anthropic) are encrypted with AES-256-GCM under a server master key from
  `POLARIS_MASTER_KEY` (32 bytes, base64). Each value gets a random IV, and the user id is the
  additional authenticated data, so a ciphertext copied into another user's row fails to
  decrypt.
- If no master key is configured, Polaris generates one on first start in the data directory
  (`data/master.key`, readable only by its owner) and logs a warning to move it into the
  environment.
- The API treats keys as write-only. Responses show only the provider, the model and the last
  four characters. Keys never go back to the browser, never appear in logs and are never put
  into prompts.
- Removing a key deletes its row.

## Alternatives considered

- Keys kept only in the browser (localStorage, calls made from the client): no server custody,
  but any XSS exposes the key, background AI jobs stop working, and the key has to be entered on
  every device.
- An external secret manager (Vault, a cloud KMS): right for managed hosting, too much for a
  self-hosted single instance. The encryption sits behind a small `SecretBox` interface so it
  can be swapped later.

## If reversed

Rotating the master key needs a re-encryption script, which does not exist yet.
