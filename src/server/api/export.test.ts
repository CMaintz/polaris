import { describe, expect, it } from "vitest";
import { signedInClient, testContainer } from "../test-support";

describe("data export", () => {
  it("lists publishing connections without their sealed tokens or OAuth states", async () => {
    const container = testContainer();
    const client = await signedInClient(container);
    const account = await container.content.ensureAccount(client.userId, "2026-03-15T12:00:00Z");
    container.db
      .prepare(
        `INSERT INTO publishing_connections (account_id, provider, sealed_token, member_urn, created_at)
         VALUES (?, 'linkedin-api', 'sealed-token-value', 'urn:li:person:abc', '2026-03-15')`,
      )
      .run(account.id);
    container.db
      .prepare(
        `INSERT INTO publishing_oauth_states (state_hash, user_id, account_id, provider, expires_at)
         VALUES ('state-hash-value', ?, ?, 'linkedin-api', '2026-03-16')`,
      )
      .run(client.userId, account.id);

    const text = await (await client.request("/me/export")).text();
    expect(text).toContain("urn:li:person:abc");
    expect(text).not.toContain("sealed-token-value");
    expect(text).not.toContain("state-hash-value");
  });
});
