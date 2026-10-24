import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { JobWorker } from "../../application/jobs/job-worker";
import {
  FAKE_KEY,
  addAccount,
  fakePost,
  fakeProvider,
  fakeWebResearch,
  intelligenceDb,
} from "../../testing/intelligence";
import { SqliteAiStore } from "../../infrastructure/db/ai-store";
import type { Db } from "../../infrastructure/db/database";
import { SqliteJobRepository } from "../../infrastructure/db/job-repository";
import { assembleIntelligence } from "../../composition/intelligence";
import { type AppEnv, errorResponse } from "../http";
import { intelligenceRoutes } from "./intelligence";

const NOW = new Date("2026-03-15T12:00:00.000Z");

let db: Db;
let app: Hono<AppEnv>;
let worker: JobWorker;
let alice: { userId: string; accountId: string };
let bob: { userId: string; accountId: string };
const accounts = new Map<string, string>();

const REPORT = {
  summary: "Summary",
  findings: [{ finding: "Found it", sourceIds: ["S1"] }],
  relation: { text: "Relates", topics: [], postIds: [] },
  caveats: [],
};

beforeEach(() => {
  db = intelligenceDb();
  alice = addAccount(db);
  bob = addAccount(db);
  accounts.clear();
  accounts.set(alice.userId, alice.accountId).set(bob.userId, bob.accountId);
  const jobs = new SqliteJobRepository(db);
  const built = assembleIntelligence({
    db,
    jobs,
    clock: () => NOW,
    credentials: {
      activeKey: async () => FAKE_KEY,
      activeProvider: async () => fakeProvider([REPORT]),
    },
    posts: { posts: async () => [fakePost("p1", { topics: ["ai"], engagements: 3 })] },
    recorder: new SqliteAiStore(db),
    resolveAccount: async (userId) => accounts.get(userId) ?? null,
    allowHttpFeeds: false,
    webResearch: () =>
      fakeWebResearch({ text: "notes", sources: [{ url: "https://src.example", title: "Src" }] }),
    fetcher: { fetch: async () => ({ title: "Feed", items: [] }) },
  });
  worker = new JobWorker(jobs, built.handlers, () => NOW);
  app = new Hono<AppEnv>();
  app.onError((error, c) => errorResponse(c, error));
  app.use(async (c, next) => {
    const id = c.req.header("x-user");
    c.set("user", id ? { id, email: `${id}@example.com`, createdAt: "" } : null);
    await next();
  });
  app.route("/intelligence", intelligenceRoutes(built.routes));
});

const call = (user: string | null, method: string, path: string, body?: object) =>
  app.request(`/intelligence${path}`, {
    method,
    headers: { "content-type": "application/json", ...(user ? { "x-user": user } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

const created = async (response: Response) =>
  ((await response.json()) as { item: { id: string } }).item;

describe("intelligence routes", () => {
  it("requires a signed-in user", async () => {
    expect((await call(null, "GET", "/peers")).status).toBe(401);
  });

  it("never shows or changes another account's peers, feeds or schedules", async () => {
    const peer = await created(await call(alice.userId, "POST", "/peers", { name: "Rival" }));
    const feed = (
      (await (
        await call(alice.userId, "POST", "/feeds", { url: "https://f.example/rss" })
      ).json()) as {
        feed: { id: string };
      }
    ).feed;
    const schedule = await created(
      await call(alice.userId, "POST", "/schedules", { kind: "feed_refresh", cadence: "daily" }),
    );
    expect(await (await call(bob.userId, "GET", "/peers")).json()).toEqual({ items: [] });
    expect(await (await call(bob.userId, "GET", "/feeds")).json()).toEqual({ items: [] });
    expect((await call(bob.userId, "PUT", `/peers/${peer.id}`, { name: "Mine now" })).status).toBe(
      404,
    );
    expect((await call(bob.userId, "DELETE", `/peers/${peer.id}`)).status).toBe(404);
    expect((await call(bob.userId, "DELETE", `/feeds/${feed.id}`)).status).toBe(404);
    expect(
      (await call(bob.userId, "PATCH", `/schedules/${schedule.id}`, { enabled: false })).status,
    ).toBe(404);
    expect(
      (await call(bob.userId, "POST", "/research", { question: "Who?", peerId: peer.id })).status,
    ).toBe(404);
    expect(
      (
        await call(bob.userId, "POST", "/schedules", {
          kind: "research_rerun",
          cadence: "weekly",
          params: { question: "Who?", peerId: peer.id },
        })
      ).status,
    ).toBe(404);
  });

  it("refuses a peer profile link that is not http(s)", async () => {
    const response = await call(alice.userId, "POST", "/peers", {
      name: "X",
      profileUrl: "javascript:alert(1)",
    });
    expect(response.status).toBe(400);
  });

  it("answers a research question in the background and lists the report with its sources", async () => {
    const response = await call(alice.userId, "POST", "/research", {
      question: "What is new in AI?",
    });
    expect(response.status).toBe(202);
    expect((await (await call(alice.userId, "GET", "/research")).json()) as object).toMatchObject({
      items: [{ status: "running" }],
    });
    await worker.drain();
    const { items } = (await (await call(alice.userId, "GET", "/research")).json()) as {
      items: { status: string; report: { findings: { sources: { url: string }[] }[] } }[];
    };
    expect(items[0]?.status).toBe("completed");
    expect(items[0]?.report.findings[0]?.sources[0]?.url).toBe("https://src.example/");
    expect(await (await call(bob.userId, "GET", "/research")).json()).toEqual({ items: [] });
  });

  it("asks a user without an account to import data before creating anything", async () => {
    const response = await call("stranger", "POST", "/peers", { name: "X" });
    expect(response.status).toBe(409);
    expect(await (await call("stranger", "GET", "/trends")).json()).toEqual({
      trackedSince: null,
      topics: [],
      recent: [],
    });
  });
});
