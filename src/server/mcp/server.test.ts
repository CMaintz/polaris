import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterEach, describe, expect, it } from "vitest";
import {
  connectClient,
  databaseFile,
  postIdByText,
  userWithDemo,
  userWithPosts,
} from "../testing/mcp";
import { type McpContext, openMcpContext } from "../composition/mcp";

// Wide reach leads on impressions and engagements, Sharp hit on engagement rate
// (50/500) and Chatty on comments, so each sort key picks a different post.
const ADA_POSTS = [
  "date,text,type,impressions,reactions,comments,reposts",
  "2026-03-02,Wide reach #growth,text,10000,50,10,0",
  "2026-03-04,Sharp hit #growth,image,500,40,5,5",
  "2026-03-06,Chatty #craft,text,2000,10,30,0",
].join("\n");

const BOB_POSTS = ["date,text,impressions,reactions", "2026-03-03,Bob only,900,9"].join("\n");

let open: { cleanup(): void }[] = [];
afterEach(() => {
  for (const item of open.reverse()) item.cleanup();
  open = [];
});

function tracked<T extends { cleanup(): void }>(item: T): T {
  open.push(item);
  return item;
}

async function contextFor(dbPath: string, userId?: string): Promise<McpContext> {
  const env = { POLARIS_DB_PATH: dbPath, ...(userId ? { POLARIS_USER_ID: userId } : {}) };
  const context = await openMcpContext(env);
  tracked({ cleanup: () => context.close() });
  return context;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(`${name} failed: ${JSON.stringify(result.content)}`);
  return result.structuredContent as Record<string, unknown>;
}

async function adaOnly() {
  const file = tracked(databaseFile());
  const adaId = await userWithPosts(file.container, "ada@example.com", ADA_POSTS);
  return { ...file, adaId };
}

async function adaAndBob() {
  const file = await adaOnly();
  const bobId = await userWithPosts(file.container, "bob@example.com", BOB_POSTS);
  return { ...file, bobId };
}

const excerpts = (page: Record<string, unknown>) =>
  (page["items"] as { excerpt: string }[]).map((p) => p.excerpt);

describe("list_posts", () => {
  it("sorts by the column each sort key names", async () => {
    const { dbPath, adaId } = await adaOnly();
    const client = await connectClient(await contextFor(dbPath, adaId));
    const top = async (sort: string) =>
      excerpts(await call(client, "list_posts", { sort, limit: 1 }))[0];
    expect(await top("engagement_rate")).toBe("Sharp hit #growth");
    expect(await top("comments")).toBe("Chatty #craft");
    expect(await top("impressions")).toBe("Wide reach #growth");
  });

  it("keeps only posts published inside the range", async () => {
    const { dbPath, adaId } = await adaOnly();
    const client = await connectClient(await contextFor(dbPath, adaId));
    const page = await call(client, "list_posts", { from: "2026-03-03", to: "2026-03-05" });
    expect(excerpts(page)).toEqual(["Sharp hit #growth"]);
  });
});

describe("user scoping", () => {
  it("serves only the configured user's posts", async () => {
    const { dbPath, adaId, container } = await adaAndBob();
    const client = await connectClient(await contextFor(dbPath, adaId));
    expect(excerpts(await call(client, "list_posts"))).not.toContain("Bob only");
    const bobPost = postIdByText(container, "Bob only");
    const result = await client.callTool({ name: "get_post", arguments: { id: bobPost } });
    expect(result.isError).toBe(true);
  });

  it("uses the only user when none is configured", async () => {
    const { dbPath } = await adaOnly();
    const client = await connectClient(await contextFor(dbPath));
    expect(excerpts(await call(client, "list_posts"))).toHaveLength(3);
  });

  it("refuses to guess between several users", async () => {
    const { dbPath } = await adaAndBob();
    await expect(openMcpContext({ POLARIS_DB_PATH: dbPath })).rejects.toThrow(/POLARIS_USER_ID/);
  });

  it("refuses a configured user that does not exist", async () => {
    const { dbPath } = await adaOnly();
    const env = { POLARIS_DB_PATH: dbPath, POLARIS_USER_ID: "no-such-user" };
    await expect(openMcpContext(env)).rejects.toThrow(/no-such-user/);
  });
});

describe("tool arguments", () => {
  it("returns the breakdown dimension asked for", async () => {
    const { dbPath, adaId } = await adaOnly();
    const client = await connectClient(await contextFor(dbPath, adaId));
    const keys = async (dimension: string) =>
      ((await call(client, "breakdowns", { dimension }))["segments"] as { key: string }[])
        .map((s) => s.key)
        .sort();
    expect(await keys("topic")).toEqual(["craft", "growth"]);
    expect(await keys("content_type")).toEqual(["image", "text"]);
  });

  it("buckets the time series by the interval asked for", async () => {
    const { dbPath, adaId } = await adaOnly();
    const client = await connectClient(await contextFor(dbPath, adaId));
    const range = { metric: "posts", from: "2026-03-02", to: "2026-03-15" };
    const points = async (interval: string) =>
      ((await call(client, "timeseries", { ...range, interval }))["points"] as unknown[]).length;
    expect(await points("day")).toBe(14);
    expect(await points("week")).toBe(2);
  });

  it("returns the full text and baseline of one post", async () => {
    const { dbPath, adaId, container } = await adaOnly();
    const client = await connectClient(await contextFor(dbPath, adaId));
    const detail = await call(client, "get_post", { id: postIdByText(container, "Chatty #craft") });
    expect(detail["post"]).toMatchObject({ text: "Chatty #craft", metrics: { comments: 30 } });
    expect(detail["baseline"]).toMatchObject({ posts: 2 });
  });
});

describe("output schemas", () => {
  // The SDK rejects a result that does not match its outputSchema, so a nullable field
  // typed as required would turn a real answer into a tool error.
  it("lets every tool answer over a fully populated account", async () => {
    const file = tracked(databaseFile());
    const userId = await userWithDemo(file.container, "demo@example.com");
    const client = await connectClient(await contextFor(file.dbPath, userId));
    const dashboard = await call(client, "dashboard", { days: 28 });
    const firstPost = (dashboard["recentPosts"] as { id: string }[])[0]?.id;
    expect(dashboard["periodDays"]).toBe(28);
    expect(await call(client, "get_post", { id: firstPost })).toHaveProperty("post.text");
    expect(await call(client, "timeseries", { metric: "followers" })).toHaveProperty("points");
    expect((await call(client, "rule_insights"))["insights"]).not.toHaveLength(0);
    expect((await call(client, "audience"))["dimensions"]).not.toHaveLength(0);
    expect((await call(client, "breakdowns", { dimension: "hour" }))["segments"]).not.toEqual([]);
  });
});
