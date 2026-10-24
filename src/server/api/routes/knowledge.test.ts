import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { KnowledgeIndexer } from "../../application/knowledge/index-service";
import { KnowledgeSearch } from "../../application/knowledge/search-service";
import { ThemeService } from "../../application/knowledge/theme-service";
import { clock, embedderSource, knowledgeDb, seedAccount } from "../../testing/knowledge";
import { SqliteJobRepository } from "../../infrastructure/db/job-repository";
import type { SearchResponseDto } from "../../../shared/knowledge-types";
import { type AppEnv, errorResponse } from "../http";
import { knowledgeRoutes } from "./knowledge";

async function setup() {
  const ctx = knowledgeDb();
  const jobs = new SqliteJobRepository(ctx.db);
  const embedders = embedderSource(null);
  const deps = { index: ctx.index, vectors: ctx.vectors, embedders, recorder: ctx.aiStore, clock };
  const a = await seedAccount(ctx.db, "a@x.io", [{ text: "Pricing notes" }]);
  const b = await seedAccount(ctx.db, "b@x.io", [{ text: "Pricing secrets" }]);
  const accounts = new Map([
    [a.userId, a.accountId],
    [b.userId, b.accountId],
  ]);
  const routes = knowledgeRoutes({
    search: new KnowledgeSearch(deps),
    indexer: new KnowledgeIndexer({ ...deps, jobs }),
    themes: new ThemeService({
      providers: { activeProvider: async () => null },
      posts: ctx.queries,
      themes: ctx.themes,
      owners: ctx.index,
      recorder: ctx.aiStore,
      jobs,
      clock,
    }),
    resolveAccount: async (userId) => accounts.get(userId) ?? null,
  });
  const as = (userId: string | null) => {
    const app = new Hono<AppEnv>();
    app.onError((error, c) => errorResponse(c, error));
    app.use(async (c, next) => {
      c.set("user", userId ? { id: userId, email: "e", createdAt: "" } : null);
      await next();
    });
    app.route("/knowledge", routes);
    return (path: string, init?: RequestInit) =>
      app.request(`/knowledge${path}`, {
        headers: { "content-type": "application/json" },
        ...init,
      });
  };
  return { a, b, as };
}

describe("knowledge routes", () => {
  it("require a session", async () => {
    const { as } = await setup();
    expect((await as(null)("/search?q=pricing")).status).toBe(401);
    expect((await as(null)("/index", { method: "POST", body: "{}" })).status).toBe(401);
  });

  it("search the signed-in user's own account", async () => {
    const { a, b, as } = await setup();
    await as(b.userId)("/search?q=pricing");
    const response = await as(a.userId)("/search?q=pricing&mode=semantic");
    const body = (await response.json()) as SearchResponseDto;
    expect(body.results.map((r) => r.postId)).toEqual(a.ids);
    expect(body).toMatchObject({ requested: "semantic", used: "lexical" });
  });

  it("reject an empty query and answer a user without an account with nothing", async () => {
    const { a, as } = await setup();
    expect((await as(a.userId)("/search?q=%20")).status).toBe(400);
    const stranger = await as("nobody")("/search?q=pricing");
    expect(((await stranger.json()) as SearchResponseDto).results).toEqual([]);
    expect((await as("nobody")("/index", { method: "POST", body: "{}" })).status).toBe(409);
  });

  it("start an index job and report it in the status", async () => {
    const { a, as } = await setup();
    const started = await as(a.userId)("/index", {
      method: "POST",
      body: JSON.stringify({ tz: 60 }),
    });
    expect(started.status).toBe(202);
    const status = (await (await as(a.userId)("/status")).json()) as {
      keywordIndexed: number;
      lastJob: { status: string };
    };
    expect(status).toMatchObject({ keywordIndexed: 1, lastJob: { status: "queued" } });
  });
});
