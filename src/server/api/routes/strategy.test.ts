import type { Db } from "../../infrastructure/db/database";
import { describe, expect, it } from "vitest";
import { buildDemoBundle } from "../../infrastructure/demo/demo-provider";
import { signedInClient, testContainer } from "../../test-support";

const NOW = "2026-03-15T12:00:00.000Z";

async function setup() {
  const container = testContainer();
  const users = {
    ada: await signedInClient(container, "ada@example.com"),
    eve: await signedInClient(container, "eve@example.com"),
  };
  for (const { userId } of Object.values(users)) {
    const account = await container.content.ensureAccount(userId, NOW);
    await container.content.applyBundle(
      account,
      buildDemoBundle("2026-03-15"),
      `job-${userId}`,
      NOW,
    );
  }
  const as =
    (request: (path: string, init?: RequestInit) => Response | Promise<Response>) =>
    (path: string, method = "GET", body?: object) =>
      request(`/strategy${path}`, { method, body: body && JSON.stringify(body) });
  const anonymous = (path: string, method = "GET", body?: object) =>
    container.api.request(`/strategy${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body && JSON.stringify(body),
    });
  const { request } = users.ada;
  return {
    db: container.db,
    ada: as(request),
    adaRaw: request,
    eve: as(users.eve.request),
    anonymous,
  };
}

const campaign = {
  name: "Spring launch",
  objective: "Reach product leads",
  startDate: "2026-02-01",
  endDate: "2026-02-28",
  notes: "keep me",
};

type Call = Awaited<ReturnType<typeof setup>>["ada"];

async function created(call: Call, path: string, body: object): Promise<{ id: string }> {
  const response = await call(path, "POST", body);
  expect(response.status).toBe(201);
  return ((await response.json()) as { item: { id: string } }).item;
}

function rowOf(db: Db, sql: string, user: string): string {
  return (db.prepare(sql).get(`${user}@example.com`) as { id: string }).id;
}

const postOf = (db: Db, user: string) =>
  rowOf(
    db,
    "SELECT p.id FROM posts p JOIN accounts a ON a.id = p.account_id WHERE a.user_id = (SELECT id FROM users WHERE email = ?) ORDER BY p.published_at DESC",
    user,
  );

function insertOwned(db: Db, table: "goals" | "plan_items", user: string, postId: string | null) {
  const accountId = rowOf(
    db,
    "SELECT id FROM accounts WHERE user_id = (SELECT id FROM users WHERE email = ?)",
    user,
  );
  const id = `${table}-${user}`;
  if (table === "goals") {
    db.prepare(
      `INSERT INTO goals (id, account_id, name, metric, target, start_date, end_date, status, created_at, updated_at)
       VALUES (?, ?, 'G', 'impressions', 1, '2026-01-01', '2026-12-31', 'active', ?, ?)`,
    ).run(id, accountId, NOW, NOW);
  } else {
    db.prepare(
      `INSERT INTO plan_items (id, account_id, title, status, post_id, created_at, updated_at)
       VALUES (?, ?, 'P', 'published', ?, ?, ?)`,
    ).run(id, accountId, postId, NOW, NOW);
  }
  return id;
}

const noLinks = { postIds: [], planItemIds: [], goalIds: [] };

describe("campaigns", () => {
  it("requires a session", async () => {
    const { anonymous } = await setup();
    expect((await anonymous("/campaigns")).status).toBe(401);
  });

  it("does not let another user read, change or delete a campaign", async () => {
    const { ada, eve } = await setup();
    const { id } = await created(ada, "/campaigns", campaign);
    expect(await (await eve("/campaigns")).json()).toEqual({ items: [] });
    expect((await eve(`/campaigns/${id}`)).status).toBe(404);
    expect((await eve(`/campaigns/${id}`, "PATCH", { name: "x" })).status).toBe(404);
    expect((await eve(`/campaigns/${id}/links`, "PUT", noLinks)).status).toBe(404);
    expect((await eve(`/campaigns/${id}/performance`)).status).toBe(404);
    expect((await eve(`/campaigns/${id}`, "DELETE")).status).toBe(404);
    expect((await ada(`/campaigns/${id}`)).status).toBe(200);
  });

  it("keeps fields a partial update did not send, and rejects an end before the start", async () => {
    const { ada } = await setup();
    const { id } = await created(ada, "/campaigns", campaign);
    const patched = await ada(`/campaigns/${id}`, "PATCH", { status: "active" });
    expect(await patched.json()).toMatchObject({ item: { status: "active", notes: "keep me" } });
    const bad = await ada(`/campaigns/${id}`, "PATCH", { endDate: "2026-01-01" });
    expect(bad.status).toBe(400);
  });

  it("refuses to link another account's post", async () => {
    const { db, ada } = await setup();
    const { id } = await created(ada, "/campaigns", campaign);
    const links = { ...noLinks, postIds: [postOf(db, "eve")] };
    expect((await ada(`/campaigns/${id}/links`, "PUT", links)).status).toBe(404);
  });

  it("refuses to link another account's plan item", async () => {
    const { db, ada } = await setup();
    const { id } = await created(ada, "/campaigns", campaign);
    const links = { ...noLinks, planItemIds: [insertOwned(db, "plan_items", "eve", null)] };
    expect((await ada(`/campaigns/${id}/links`, "PUT", links)).status).toBe(404);
  });

  it("refuses to link another account's goal", async () => {
    const { db, ada } = await setup();
    const { id } = await created(ada, "/campaigns", campaign);
    const links = { ...noLinks, goalIds: [insertOwned(db, "goals", "eve", null)] };
    expect((await ada(`/campaigns/${id}/links`, "PUT", links)).status).toBe(404);
  });

  it("measures the posts linked directly and through a published plan item", async () => {
    const { db, ada } = await setup();
    const { id } = await created(ada, "/campaigns", campaign);
    const [direct, viaPlan] = (
      db
        .prepare(
          `SELECT p.id FROM posts p JOIN accounts a ON a.id = p.account_id
           WHERE a.user_id = (SELECT id FROM users WHERE email = 'ada@example.com') AND p.published_at LIKE '2026-02-%' LIMIT 2`,
        )
        .all() as { id: string }[]
    ).map((r) => r.id);
    const links = {
      postIds: [direct as string],
      planItemIds: [insertOwned(db, "plan_items", "ada", viaPlan as string)],
      goalIds: [insertOwned(db, "goals", "ada", null)],
    };
    expect((await ada(`/campaigns/${id}/links`, "PUT", links)).status).toBe(200);
    const perf = (await (await ada(`/campaigns/${id}/performance`)).json()) as {
      campaign: { posts: { posts: number }; followerChange: { value: number | null } };
      baseline: { window: { from: string; to: string }; postsPublished: { value: number } };
      posts: unknown[];
    };
    expect(perf.posts).toHaveLength(2);
    expect(perf.campaign.posts.posts).toBe(2);
    expect(perf.baseline.window).toEqual({ from: "2026-01-04", to: "2026-01-31" });
    expect(perf.baseline.postsPublished.value).toBeGreaterThan(0);
    expect(perf.campaign.followerChange.value).toBeGreaterThan(0);
  });
});

describe("pillars", () => {
  const pillar = { name: "AI", description: "", topics: ["#AI"], targetShare: 0.6 };

  it("rejects target shares that add up to more than 100%", async () => {
    const { ada } = await setup();
    await created(ada, "/pillars", pillar);
    expect((await ada("/pillars", "POST", { ...pillar, targetShare: 0.5 })).status).toBe(400);
    expect((await ada("/pillars", "POST", { ...pillar, targetShare: 0.4 })).status).toBe(201);
  });

  it("lets a pillar change its own share without counting its old share twice", async () => {
    const { ada } = await setup();
    const { id } = await created(ada, "/pillars", pillar);
    expect((await ada(`/pillars/${id}`, "PATCH", { targetShare: 0.7 })).status).toBe(200);
  });

  it("reports actual shares from the user's own posts against normalised topics", async () => {
    const { ada, eve } = await setup();
    await created(ada, "/pillars", pillar);
    const report = (await (await ada("/pillars/report")).json()) as {
      posts: number;
      pillars: { name: string; actualShare: number | null; posts: number }[];
    };
    expect(report.posts).toBeGreaterThan(0);
    expect(report.pillars[0]?.name).toBe("AI");
    expect(report.pillars[0]?.posts).toBeGreaterThan(0);
    expect(await (await eve("/pillars/report")).json()).toMatchObject({ pillars: [] });
  });

  it("does not let another user change or delete a pillar", async () => {
    const { ada, eve } = await setup();
    const { id } = await created(ada, "/pillars", pillar);
    expect((await eve(`/pillars/${id}`, "PATCH", { targetShare: 0.1 })).status).toBe(404);
    expect((await eve(`/pillars/${id}`, "DELETE")).status).toBe(404);
  });
});

describe("funnel", () => {
  it("returns monthly stages with profile views unavailable and paired conversions", async () => {
    const { ada } = await setup();
    const funnel = (await (await ada("/funnel?granularity=month")).json()) as {
      steps: {
        impressions: { value: number | null };
        profileViews: { value: null };
        engagementRate: { value: number | null };
      }[];
    };
    const full = funnel.steps.filter((s) => s.impressions.value !== null);
    expect(full.length).toBeGreaterThan(6);
    expect(full[0]?.profileViews.value).toBeNull();
    expect(full[0]?.engagementRate.value).toBeGreaterThan(0);
  });

  it("has no campaign funnel before the campaign starts", async () => {
    const { ada } = await setup();
    const { id } = await created(ada, "/campaigns", {
      ...campaign,
      startDate: "2026-04-01",
      endDate: "2026-04-30",
    });
    expect(await (await ada(`/campaigns/${id}/funnel`)).json()).toMatchObject({ step: null });
  });
});

describe("data export", () => {
  it("includes campaigns and their links, which have no account column of their own", async () => {
    const { db, ada, adaRaw } = await setup();
    const { id } = await created(ada, "/campaigns", campaign);
    const postId = postOf(db, "ada");
    const links = { ...noLinks, postIds: [postId] };
    expect((await ada(`/campaigns/${id}/links`, "PUT", links)).status).toBe(200);
    const response = await adaRaw("/me/export");
    const data = (await response.json()) as Record<string, { id?: string; post_id?: string }[]>;
    expect(data["campaigns"]?.map((c) => c.id)).toEqual([id]);
    expect(data["campaign_posts"]?.map((l) => l.post_id)).toEqual([postId]);
  });
});
