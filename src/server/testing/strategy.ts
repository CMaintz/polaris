import { expect } from "vitest";
import type { Db } from "../infrastructure/db/database";
import { buildDemoBundle } from "../infrastructure/demo/demo-provider";
import { signedInClient, testContainer } from "../test-support";

const NOW = "2026-03-15T12:00:00.000Z";

/** Two signed-in users, Ada and Eve, each with the demo dataset imported. */
export async function strategyKit() {
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

export const campaign = {
  name: "Spring launch",
  objective: "Reach product leads",
  startDate: "2026-02-01",
  endDate: "2026-02-28",
  notes: "keep me",
};

type Call = Awaited<ReturnType<typeof strategyKit>>["ada"];

export async function created(call: Call, path: string, body: object): Promise<{ id: string }> {
  const response = await call(path, "POST", body);
  expect(response.status).toBe(201);
  return ((await response.json()) as { item: { id: string } }).item;
}

function rowOf(db: Db, sql: string, user: string): string {
  return (db.prepare(sql).get(`${user}@example.com`) as { id: string }).id;
}

export const postOf = (db: Db, user: string) =>
  rowOf(
    db,
    "SELECT p.id FROM posts p JOIN accounts a ON a.id = p.account_id WHERE a.user_id = (SELECT id FROM users WHERE email = ?) ORDER BY p.published_at DESC",
    user,
  );

export function insertOwned(
  db: Db,
  table: "goals" | "plan_items",
  user: string,
  postId: string | null,
) {
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

export const noLinks = { postIds: [], planItemIds: [], goalIds: [] };
