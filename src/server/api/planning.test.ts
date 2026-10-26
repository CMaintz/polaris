import { describe, expect, it } from "vitest";
import { TEST_PASSWORD, signedInClient, testContainer } from "../test-support";

// Built at runtime and low-entropy, so secret scanners do not mistake it for a real key.
const FAKE_KEY = ["test", "key", "x".repeat(24)].join("-");

const goal = {
  name: "Grow reach",
  metric: "impressions",
  target: 100000,
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  notes: "keep me",
};

async function withDemo() {
  const container = testContainer();
  const client = await signedInClient(container);
  await client.request("/imports/demo", { method: "POST" });
  await container.worker.drain();
  return { container, client };
}

const post = (client: Awaited<ReturnType<typeof signedInClient>>, path: string, body: object) =>
  client.request(path, { method: "POST", body: JSON.stringify(body) });

describe("goals", () => {
  it("returns goals with progress measured from imported data", async () => {
    const { client } = await withDemo();
    await post(client, "/goals", goal);
    const { items } = (await (await client.request("/goals")).json()) as {
      items: { progress: { current: number | null; status: string } }[];
    };
    expect(items[0]?.progress.current).toBeGreaterThan(0);
    expect(items[0]?.progress.status).not.toBe("no_data");
  });

  it("rejects an end date before the start date", async () => {
    const { client } = await withDemo();
    const response = await post(client, "/goals", { ...goal, endDate: "2025-01-01" });
    expect(response.status).toBe(400);
  });

  it("keeps fields a partial update did not send", async () => {
    const { client } = await withDemo();
    const { item } = (await (await post(client, "/goals", goal)).json()) as {
      item: { id: string };
    };
    const response = await client.request(`/goals/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ target: 5 }),
    });
    expect(await response.json()).toMatchObject({
      item: { target: 5, notes: "keep me", status: "active" },
    });
  });

  it("does not let another user read, change or delete a goal", async () => {
    const { container, client } = await withDemo();
    const { item } = (await (await post(client, "/goals", goal)).json()) as {
      item: { id: string };
    };
    const other = await signedInClient(container, "other@example.com");
    expect(await (await other.request("/goals")).json()).toEqual({ items: [] });
    const patch = await other.request(`/goals/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ target: 1 }),
    });
    expect(patch.status).toBe(404);
    expect((await other.request(`/goals/${item.id}`, { method: "DELETE" })).status).toBe(404);
  });
});

describe("experiments and plans", () => {
  it("evaluates an experiment and refuses links to another user's goal", async () => {
    const { container, client } = await withDemo();
    const other = await signedInClient(container, "other@example.com");
    const { item: foreignGoal } = (await (await post(other, "/goals", goal)).json()) as {
      item: { id: string };
    };
    const experiment = {
      name: "Documents",
      hypothesis: "Document posts get more engagement",
      metric: "engagements",
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    };
    expect(
      (await post(client, "/experiments", { ...experiment, goalId: foreignGoal.id })).status,
    ).toBe(404);
    expect((await post(client, "/experiments", experiment)).status).toBe(201);
    const { items } = (await (await client.request("/experiments")).json()) as {
      items: { evaluation: { verdict: string } }[];
    };
    expect(items[0]?.evaluation.verdict).toBeDefined();
  });

  it("refuses to link a plan item to another user's post", async () => {
    const { container } = await withDemo();
    const other = await signedInClient(container, "other@example.com");
    const { id } = container.db.prepare("SELECT id FROM posts LIMIT 1").get() as { id: string };
    expect((await post(other, "/plan", { title: "Idea", postId: id })).status).toBe(404);
  });
});

describe("data lifecycle", () => {
  it("exports the user's data without secrets", async () => {
    const { client } = await withDemo();
    await client.request("/ai/credentials/openai", {
      method: "PUT",
      body: JSON.stringify({ apiKey: FAKE_KEY }),
    });
    const response = await client.request("/me/export");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    const body = await response.text();
    expect(JSON.parse(body).posts.length).toBeGreaterThan(0);
    expect(body).not.toContain(FAKE_KEY);
    expect(body).not.toContain("scrypt$");
    expect(body).not.toContain("sealed");
  });

  it("deletes imported data only with the right password, and keeps the user's own plans", async () => {
    const { container, client } = await withDemo();
    await post(client, "/goals", goal);
    const wrong = await client.request("/me/data", {
      method: "DELETE",
      body: JSON.stringify({ password: "nope" }),
    });
    expect(wrong.status).toBe(401);
    await client.request("/me/data", {
      method: "DELETE",
      body: JSON.stringify({ password: TEST_PASSWORD }),
    });
    const count = (table: string) =>
      (container.db.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as { n: number }).n;
    expect(count("posts")).toBe(0);
    expect(count("account_metric_days")).toBe(0);
    expect(count("goals")).toBe(1);
    const account = container.db.prepare("SELECT display_name, headline FROM accounts").get();
    expect(account).toEqual({ display_name: null, headline: null });
  });

  it("deletes the account and everything it owns", async () => {
    const { container, client } = await withDemo();
    await post(client, "/goals", goal);
    const response = await client.request("/me", {
      method: "DELETE",
      body: JSON.stringify({ password: TEST_PASSWORD }),
    });
    expect(response.status).toBe(204);
    expect((await client.request("/auth/me")).status).toBe(401);
    for (const table of ["users", "accounts", "posts", "goals", "jobs", "sessions"]) {
      expect(
        (container.db.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as { n: number }).n,
      ).toBe(0);
    }
  });
});
