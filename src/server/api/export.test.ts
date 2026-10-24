import { strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { SHARES_CSV } from "../testing/linkedin-fixtures";
import {
  TEST_PASSWORD,
  type TestContainer,
  importAndWait,
  signedInClient,
  testContainer,
} from "../test-support";

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

describe("data lifecycle across accounts", () => {
  const GENERIC = "date,text\n2026-03-02,Blog post one\n";

  async function twoAccounts() {
    const container = testContainer();
    const client = await signedInClient(container);
    await importAndWait(container, client, { "Shares.csv": strToU8(SHARES_CSV) });
    await client.request("/accounts", {
      method: "POST",
      body: JSON.stringify({ platform: "other", label: "Blog" }),
    });
    await importAndWait(container, client, { "posts.csv": strToU8(GENERIC) });
    await client.request("/plan", { method: "POST", body: JSON.stringify({ title: "Blog idea" }) });
    return { container, client };
  }

  const count = (container: TestContainer, table: string) =>
    (container.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

  it("exports every account of the user, with each account's posts", async () => {
    const { client } = await twoAccounts();
    const data = (await (await client.request("/me/export")).json()) as {
      accounts: { label: string }[];
      posts: { text: string }[];
      plan_items: { title: string }[];
    };
    expect(data.accounts.map((a) => a.label)).toEqual(["LinkedIn", "Blog"]);
    expect(data.posts.map((p) => p.text)).toContain("Blog post one");
    expect(data.posts).toHaveLength(3);
    expect(data.plan_items.map((p) => p.title)).toEqual(["Blog idea"]);
  });

  it("deletes imported data in every account and keeps the user's own records", async () => {
    const { container, client } = await twoAccounts();
    const response = await client.request("/me/data", {
      method: "DELETE",
      body: JSON.stringify({ password: TEST_PASSWORD }),
    });
    expect(response.status).toBe(204);
    expect(count(container, "posts")).toBe(0);
    expect(count(container, "accounts")).toBe(2);
    expect(count(container, "plan_items")).toBe(1);
  });

  it("deletes every account when the user is deleted", async () => {
    const { container, client } = await twoAccounts();
    await client.request("/me", {
      method: "DELETE",
      body: JSON.stringify({ password: TEST_PASSWORD }),
    });
    expect(count(container, "accounts")).toBe(0);
    expect(count(container, "posts")).toBe(0);
  });
});
