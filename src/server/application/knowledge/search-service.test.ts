import { describe, expect, it } from "vitest";
import { AiProviderError } from "../ai/ports";
import { KnowledgeSearch } from "./search-service";
import {
  FakeEmbedder,
  NOW,
  clock,
  embedderSource,
  knowledgeDb,
  reimportText,
  seedAccount,
} from "../../testing/knowledge";

const query = (q: string, mode: "lexical" | "semantic" = "lexical", filters = {}) => ({
  q,
  mode,
  filters,
  limit: 20,
});

async function setup(embedder: FakeEmbedder | null = null) {
  const ctx = knowledgeDb();
  const search = new KnowledgeSearch({
    index: ctx.index,
    vectors: ctx.vectors,
    embedders: embedderSource(embedder),
    recorder: ctx.aiStore,
    clock,
  });
  return { ...ctx, search };
}

describe("keyword search", () => {
  it("only finds the searching account's posts", async () => {
    const { db, search } = await setup();
    const mine = await seedAccount(db, "a@x.io", [{ text: "Our pricing page rewrite" }]);
    const theirs = await seedAccount(db, "b@x.io", [{ text: "Pricing secrets of a competitor" }]);
    await search.search(theirs.accountId, query("pricing")); // puts their post in the index
    const result = await search.search(mine.accountId, query("pricing"));
    expect(result.results.map((r) => r.postId)).toEqual(mine.ids);
    const context = await search.retrieveContext(mine.accountId, "pricing", 5);
    expect(context.map((c) => c.postId)).toEqual(mine.ids);
  });

  it("treats FTS operators and quotes in the query as plain words", async () => {
    const { db, search } = await setup();
    const { accountId, ids } = await seedAccount(db, "a@x.io", [
      // Holds every operator word, so the expected hit needs them read as plain words.
      { text: "Pricing or else, not near body plans" },
      { text: "Something else entirely" },
    ]);
    for (const q of ['pricing" OR "else', "pricing NEAR(", "body:pricing", "pric* NOT (", '"']) {
      const result = await search.search(accountId, query(q));
      expect(result.results.map((r) => r.postId)).toEqual(q === '"' ? [] : [ids[0]]);
    }
  });

  it("returns snippets as text segments, so markup and stray markers in a post stay inert", async () => {
    const { db, search } = await setup();
    const mark = String.fromCharCode(0xe000);
    const { accountId } = await seedAccount(db, "a@x.io", [
      {
        text: `<img src=x onerror=alert(1)> ${mark}fake${String.fromCharCode(0xe001)} pricing tips`,
      },
    ]);
    const [hit] = (await search.search(accountId, query("pricing"))).results;
    expect(hit?.snippet).toEqual([
      { text: "<img src=x onerror=alert(1)> fake ", hit: false },
      { text: "pricing", hit: true },
      { text: " tips", hit: false },
    ]);
  });

  it("follows edited and deleted posts without a re-index job", async () => {
    const { db, search } = await setup();
    const { accountId, ids } = await seedAccount(db, "a@x.io", [
      { text: "Hiring a designer" },
      { text: "Hiring an engineer" },
    ]);
    expect((await search.search(accountId, query("hiring"))).results).toHaveLength(2);
    await reimportText(db, "a@x.io", 0, "Coffee with the team");
    db.prepare("DELETE FROM posts WHERE id = ?").run(ids[1]);
    expect((await search.search(accountId, query("hiring"))).results).toEqual([]);
    expect((await search.search(accountId, query("coffee"))).results.map((r) => r.postId)).toEqual([
      ids[0],
    ]);
    expect(db.prepare("SELECT count(*) AS n FROM post_search").get()).toEqual({ n: 1 });
  });

  it("filters by content type, hashtag and publish date", async () => {
    const { db, search } = await setup();
    const { accountId, ids } = await seedAccount(db, "a@x.io", [
      { text: "Launch day #product", contentType: "video", day: "2026-05-01" },
      { text: "Launch recap #product", contentType: "text", day: "2026-06-01" },
      { text: "Launch party", contentType: "video", day: "2026-06-02" },
    ]);
    const ids_ = async (filters: object) =>
      (await search.search(accountId, query("launch", "lexical", filters))).results.map(
        (r) => r.postId,
      );
    expect(await ids_({ contentType: "video" })).toEqual(expect.arrayContaining([ids[0], ids[2]]));
    expect(await ids_({ contentType: "video" })).toHaveLength(2);
    expect(await ids_({ topic: "Product" })).toHaveLength(2);
    expect(await ids_({ from: "2026-06-01", to: "2026-06-01" })).toEqual([ids[1]]);
  });
});

describe("meaning search", () => {
  it("finds posts that share a concept but no word, and records the embedding call", async () => {
    const embedder = new FakeEmbedder();
    const { db, vectors, search, aiStore } = await setup(embedder);
    const { accountId, ids, userId } = await seedAccount(db, "a@x.io", [
      { text: "We are recruiting talent for the platform team" },
      { text: "Espresso machines ranked" },
    ]);
    const stored = await embedder.embed(["recruiting talent", "espresso"]);
    await vectors.save(
      accountId,
      embedder.model,
      ids.map((postId, i) => ({ postId, textHash: "h", vector: stored.vectors[i] })),
      NOW,
    );
    const result = await search.search(accountId, query("hiring", "semantic"));
    expect(result.used).toBe("semantic");
    expect(result.results.map((r) => [r.postId, r.matchedBy])).toEqual([[ids[0], ["meaning"]]]);
    expect(result.results[0]?.snippet).toEqual([
      { text: "We are recruiting talent for the platform team", hit: false },
    ]);
    const [interaction] = await aiStore.interactions(userId, 5);
    expect(interaction).toMatchObject({
      promptName: "query-embedding",
      status: "succeeded",
      provider: "openai",
    });
  });

  it("falls back to keywords and says why when there is no OpenAI key", async () => {
    const { db, search } = await setup(null);
    const { accountId, ids } = await seedAccount(db, "a@x.io", [{ text: "Hiring now" }]);
    const result = await search.search(accountId, query("hiring", "semantic"));
    expect(result).toMatchObject({ requested: "semantic", used: "lexical" });
    expect(result.notice).toContain("No OpenAI key");
    expect(result.results.map((r) => r.postId)).toEqual(ids);
  });

  it("falls back to keywords when the embedding call fails, and records the failure", async () => {
    const embedder = new FakeEmbedder();
    const { db, vectors, search, aiStore } = await setup(embedder);
    const { accountId, ids, userId } = await seedAccount(db, "a@x.io", [{ text: "Hiring now" }]);
    await vectors.save(
      accountId,
      embedder.model,
      [{ postId: ids[0], textHash: "h", vector: Float32Array.from([1, 0, 0]) }],
      NOW,
    );
    embedder.failWith = new AiProviderError("rate_limit", "OpenAI rate limit reached");
    const result = await search.search(accountId, query("hiring", "semantic"));
    expect(result.used).toBe("lexical");
    expect(result.notice).toContain("rate limit");
    expect((await aiStore.interactions(userId, 5))[0]).toMatchObject({ status: "failed" });
  });
});

describe("retrieveContext", () => {
  it("matches any content word of a question and says which words matched", async () => {
    const { db, search } = await setup();
    const { accountId, ids } = await seedAccount(db, "a@x.io", [
      { text: "Pricing experiments for SaaS" },
      { text: "Which of these is my favourite?" },
    ]);
    const context = await search.retrieveContext(
      accountId,
      "Which of my posts about pricing did best?",
      5,
    );
    expect(context).toEqual([
      { postId: ids[0], matchedTerms: ["pricing"], similarity: null, reason: 'matches "pricing"' },
    ]);
  });
});
