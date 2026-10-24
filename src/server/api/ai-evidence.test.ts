import { describe, expect, it } from "vitest";
import { aiKit, analysis } from "../testing/ai";

describe("evidence sent to the model", () => {
  it("sends post text past the 280-character UI excerpt", async () => {
    const { run, factory, container } = await aiKit(() => analysis(["E1"]));
    const text = `Opening line. ${"detail ".repeat(60)}closing line`;
    container.db.prepare("UPDATE posts SET text = ?").run(text);
    await run("/ai/reviews/account");
    expect(factory.calls[0]?.prompt).toContain(text);
  });

  it("keeps a topic with enough posts when single-post topics rank above it", async () => {
    const { run, factory, container } = await aiKit(() => analysis(["E1"]));
    const ids = (
      container.db
        .prepare("SELECT DISTINCT post_id id FROM post_metric_snapshots LIMIT 8")
        .all() as { id: string }[]
    ).map((r) => r.id);
    container.db.exec("DELETE FROM post_topics; DELETE FROM topics;");
    const tag = (postId: string, topic: string, engagements: number) => {
      container.db
        .prepare(
          "INSERT OR IGNORE INTO topics (id, account_id, name) SELECT ?, account_id, ? FROM posts LIMIT 1",
        )
        .run(topic, topic);
      container.db
        .prepare("INSERT INTO post_topics VALUES (?, ?, 'hashtag', 1)")
        .run(postId, topic);
      container.db
        .prepare("UPDATE post_metric_snapshots SET engagements = ? WHERE post_id = ?")
        .run(engagements, postId);
    };
    ids.slice(0, 6).forEach((id, i) => tag(id, `solo${i}`, 1000 + i));
    ids.slice(6).forEach((id) => tag(id, "steady", 1));
    await run("/ai/reviews/account");
    expect(factory.calls[0]?.prompt).toContain("topic #steady (2 posts)");
  });
});

describe("post review evidence", () => {
  it("sends the comparable posts' full text, not their excerpts", async () => {
    const { run, factory, container } = await aiKit(() => analysis(["E1"]));
    const text = `Opening line. ${"detail ".repeat(60)}closing line`;
    container.db.prepare("UPDATE posts SET text = ?").run(text);
    const { id } = container.db.prepare("SELECT id FROM posts LIMIT 1").get() as { id: string };
    const job = await run(`/ai/reviews/posts/${id}`);
    expect(job.status).toBe("completed");
    const prompt = factory.calls[0]?.prompt ?? "";
    expect(prompt).toContain("This post");
    expect(prompt.split(text).length - 1).toBeGreaterThan(1);
  });
});
