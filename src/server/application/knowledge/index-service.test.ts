import { describe, expect, it } from "vitest";
import { SqliteJobRepository } from "../../infrastructure/db/job-repository";
import { AiProviderError } from "../ai/ports";
import { PermanentJobError } from "../errors";
import type { Job } from "../jobs/ports";
import { KnowledgeIndexer } from "./index-service";
import {
  FakeEmbedder,
  clock,
  embedderSource,
  knowledgeDb,
  reimportText,
  seedAccount,
} from "../../testing/knowledge";

const noProgress = { reportProgress: async () => {} };

async function setup(embedder: FakeEmbedder | null) {
  const ctx = knowledgeDb();
  const jobs = new SqliteJobRepository(ctx.db);
  const indexer = new KnowledgeIndexer({
    index: ctx.index,
    vectors: ctx.vectors,
    embedders: embedderSource(embedder, "Meaning search needs an OpenAI key"),
    recorder: ctx.aiStore,
    jobs,
    clock,
  });
  const seeded = await seedAccount(ctx.db, "a@x.io", [
    { text: "Hiring a designer" },
    { text: "Pricing update" },
    { text: null },
  ]);
  const job = await indexer.start(seeded.userId, seeded.accountId);
  return { ...ctx, ...seeded, indexer, job };
}

describe("knowledge index job", () => {
  it("embeds each post once, and again only when its text changes", async () => {
    const embedder = new FakeEmbedder();
    const { indexer, job, db, vectors, accountId, ids } = await setup(embedder);
    await indexer.run(job, noProgress);
    expect(embedder.calls.map((c) => [...c].sort())).toEqual([
      ["Hiring a designer", "Pricing update"],
    ]);
    await indexer.run(job, noProgress);
    expect(embedder.calls).toHaveLength(1);

    await reimportText(db, "a@x.io", 1, "Pricing for recruiting tools");
    await indexer.run(job, noProgress);
    expect(embedder.calls[1]).toEqual(["Pricing for recruiting tools"]);
    const stored = await vectors.vectors(accountId, embedder.model);
    expect(stored.find((s) => s.postId === ids[1])?.vector).toEqual(Float32Array.from([1, 1, 0]));
  });

  it("records each embedding call without the post text", async () => {
    const embedder = new FakeEmbedder();
    const { indexer, job, aiStore, userId } = await setup(embedder);
    await indexer.run(job, noProgress);
    const [call] = await aiStore.interactions(userId, 5);
    expect(call).toMatchObject({
      jobId: job.id,
      promptName: "post-embedding",
      promptVersion: "v1",
      inputTokens: 10,
    });
    expect(JSON.stringify(call)).not.toContain("Hiring a designer");
  });

  it("still builds the keyword index without an OpenAI key", async () => {
    const { indexer, job, userId, accountId } = await setup(null);
    expect(await indexer.run(job, noProgress)).toMatchObject({ keywordUpdated: 2, embedded: 0 });
    expect(await indexer.status(userId, accountId)).toMatchObject({
      postsWithText: 2,
      keywordIndexed: 2,
      semantic: { available: false, reason: "Meaning search needs an OpenAI key", embedded: 0 },
    });
  });

  it("refuses a job whose payload names another user's account", async () => {
    const { indexer, db, job } = await setup(new FakeEmbedder());
    const other = await seedAccount(db, "b@x.io", [{ text: "Their secret" }]);
    const forged: Job = { ...job, payload: { accountId: other.accountId } };
    await expect(indexer.run(forged, noProgress)).rejects.toBeInstanceOf(PermanentJobError);
  });

  it("retries an outage but not a rejected key", async () => {
    const embedder = new FakeEmbedder();
    const { indexer, job } = await setup(embedder);
    embedder.failWith = new AiProviderError("unavailable", "down");
    await expect(indexer.run(job, noProgress)).rejects.toBeInstanceOf(AiProviderError);
    embedder.failWith = new AiProviderError("auth", "OpenAI rejected the API key");
    await expect(indexer.run(job, noProgress)).rejects.toBeInstanceOf(PermanentJobError);
  });
});
