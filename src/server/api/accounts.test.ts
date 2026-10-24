import { strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { SHARES_CSV } from "../testing/linkedin-fixtures";
import {
  type Client,
  TEST_PASSWORD,
  importAndWait,
  signedInClient,
  testContainer,
} from "../test-support";

interface AccountView {
  id: string;
  platform: string;
  label: string;
  active: boolean;
}

const send = (client: Client, path: string, method: string, body: object = {}) =>
  client.request(path, { method, body: JSON.stringify(body) });

async function accounts(client: Client): Promise<AccountView[]> {
  return ((await (await client.request("/accounts")).json()) as { accounts: AccountView[] })
    .accounts;
}

async function addAccount(client: Client, label = "Blog", platform = "other") {
  const response = await send(client, "/accounts", "POST", { platform, label });
  expect(response.status).toBe(201);
  return ((await response.json()) as { account: AccountView }).account;
}

const activate = (client: Client, id: string) => send(client, `/accounts/${id}/activate`, "POST");

async function dashboardPosts(client: Client): Promise<number> {
  const body = (await (await client.request("/dashboard")).json()) as { status: { posts: number } };
  return body.status.posts;
}

async function planTitles(client: Client): Promise<string[]> {
  const body = (await (await client.request("/plan")).json()) as { items: { title: string }[] };
  return body.items.map((i) => i.title);
}

async function withLinkedInPosts() {
  const container = testContainer();
  const client = await signedInClient(container);
  await importAndWait(container, client, { "Shares.csv": strToU8(SHARES_CSV) });
  await send(client, "/plan", "POST", { title: "LinkedIn idea" });
  return { container, client };
}

describe("accounts", () => {
  it("switching the active account changes what analytics and planning show", async () => {
    const { client } = await withLinkedInPosts();
    const linkedin = (await accounts(client))[0] as AccountView;
    const blog = await addAccount(client);
    expect(await dashboardPosts(client)).toBe(0);
    expect(await planTitles(client)).toEqual([]);
    await activate(client, linkedin.id);
    expect(await dashboardPosts(client)).toBe(2);
    expect(await planTitles(client)).toEqual(["LinkedIn idea"]);
    expect((await accounts(client)).map((a) => [a.label, a.active])).toEqual([
      ["LinkedIn", true],
      [blog.label, false],
    ]);
  });

  it("writes made before any import go to the active account instead of a new one", async () => {
    const container = testContainer();
    const client = await signedInClient(container);
    await send(client, "/plan", "POST", { title: "First idea" });
    await send(client, "/strategy/pillars", "POST", {
      name: "Craft",
      topics: ["craft"],
      targetShare: 0.5,
    });
    expect(await accounts(client)).toHaveLength(1);
    const blog = await addAccount(client);
    await send(client, "/plan", "POST", { title: "Blog idea" });
    expect(await accounts(client)).toHaveLength(2);
    const owner = container.db
      .prepare("SELECT account_id FROM plan_items WHERE title = 'Blog idea'")
      .get() as { account_id: string };
    expect(owner.account_id).toBe(blog.id);
  });

  it("renames an account and rejects an empty label", async () => {
    const { client } = await withLinkedInPosts();
    const blog = await addAccount(client);
    expect((await send(client, `/accounts/${blog.id}`, "PATCH", { label: "  " })).status).toBe(400);
    await send(client, `/accounts/${blog.id}`, "PATCH", { label: "Substack" });
    expect((await accounts(client)).map((a) => a.label)).toEqual(["LinkedIn", "Substack"]);
  });

  it("deletes an account only with the password, and falls back to the remaining one", async () => {
    const { container, client } = await withLinkedInPosts();
    const blog = await addAccount(client);
    await send(client, "/plan", "POST", { title: "Blog idea" });
    const wrong = await send(client, `/accounts/${blog.id}`, "DELETE", { password: "nope" });
    expect(wrong.status).toBe(401);
    const ok = await send(client, `/accounts/${blog.id}`, "DELETE", { password: TEST_PASSWORD });
    expect(ok.status).toBe(204);
    expect(await dashboardPosts(client)).toBe(2);
    const left = container.db.prepare("SELECT title FROM plan_items").all();
    expect(left).toEqual([{ title: "LinkedIn idea" }]);
  });
});

describe("account ownership", () => {
  it("never lets a user switch to, rename, read or delete another user's account", async () => {
    const { container, client: ada } = await withLinkedInPosts();
    const adaAccount = (await accounts(ada))[0] as AccountView;
    const bob = await signedInClient(container, "bob@example.com");
    await addAccount(bob, "Bob's blog");
    expect((await activate(bob, adaAccount.id)).status).toBe(404);
    expect(await dashboardPosts(bob)).toBe(0);
    const rename = await send(bob, `/accounts/${adaAccount.id}`, "PATCH", { label: "Mine" });
    expect(rename.status).toBe(404);
    const remove = await send(bob, `/accounts/${adaAccount.id}`, "DELETE", {
      password: TEST_PASSWORD,
    });
    expect(remove.status).toBe(404);
    expect((await accounts(bob)).map((a) => a.label)).toEqual(["Bob's blog"]);
    expect((await accounts(ada)).map((a) => a.label)).toEqual(["LinkedIn"]);
    expect(await dashboardPosts(ada)).toBe(2);
  });
});

describe("all-accounts plan", () => {
  it("lists every account's plan items with their account, by planned date", async () => {
    const container = testContainer();
    const client = await signedInClient(container);
    const plan = (title: string, plannedDate: string | null) =>
      send(client, "/plan", "POST", { title, plannedDate });
    await plan("LinkedIn later", "2026-04-10");
    await plan("LinkedIn undated", null);
    await addAccount(client);
    await plan("Blog sooner", "2026-04-01");
    const other = await signedInClient(container, "bob@example.com");
    await send(other, "/plan", "POST", { title: "Bob's idea", plannedDate: "2026-03-20" });
    const body = (await (await client.request("/plan/all")).json()) as {
      items: { title: string; account: { label: string } }[];
    };
    expect(body.items.map((i) => [i.title, i.account.label])).toEqual([
      ["Blog sooner", "Blog"],
      ["LinkedIn later", "LinkedIn"],
      ["LinkedIn undated", "LinkedIn"],
    ]);
  });
});
