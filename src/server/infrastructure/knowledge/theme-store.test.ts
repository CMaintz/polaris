import { describe, expect, it } from "vitest";
import { NOW, knowledgeDb, seedAccount } from "../../testing/knowledge";

const run = (basedOnDemo: boolean) => ({
  interactionId: null,
  provider: "openai",
  model: "test",
  promptVersion: "content-themes/v1",
  classifiedPostIds: [],
  postsAvailable: 1,
  basedOnDemo,
  createdAt: NOW,
});

describe("themes and the demo wipe", () => {
  it("removes themes found on demo data when the demo is deleted", async () => {
    const { db, content, themes } = knowledgeDb();
    const { accountId, ids } = await seedAccount(db, "ada@example.com", [{ text: "#ai notes" }]);
    const theme = { name: "AI", description: "Notes on AI", postIds: ids };
    await themes.replace(accountId, run(true), [theme]);
    await content.deleteDataset(accountId, "demo");
    expect(await themes.latest(accountId)).toBeNull();
    expect(db.prepare("SELECT COUNT(*) AS n FROM themes").get()).toEqual({ n: 0 });
  });

  it("keeps themes found on real data when the demo is deleted", async () => {
    const { db, content, themes } = knowledgeDb();
    const { accountId, ids } = await seedAccount(db, "ada@example.com", [{ text: "#ai notes" }]);
    await themes.replace(accountId, run(false), [{ name: "AI", description: "", postIds: ids }]);
    await content.deleteDataset(accountId, "demo");
    expect(db.prepare("SELECT COUNT(*) AS n FROM themes").get()).toEqual({ n: 1 });
  });
});
