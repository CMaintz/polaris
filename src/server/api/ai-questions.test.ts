import { describe, expect, it } from "vitest";
import { classifyQuestion } from "../application/ai/intent";
import { aiKit } from "../testing/ai";

describe("questions", () => {
  it("sends only the data the question needs and grounds the answer", async () => {
    const { run, factory } = await aiKit(() => ({
      answer: "Up.",
      evidenceIds: ["E1"],
      caveats: [],
    }));
    const job = await run("/ai/questions", { question: "How are my followers growing?", tz: 0 });
    expect(job.result).toMatchObject({
      answer: "Up.",
      intent: "followers",
      evidence: [{ id: "E1" }],
    });
    expect(factory.calls[0]?.prompt).not.toContain("<post_text");
  });

  it("adds the posts that match the question, fenced, as citable evidence", async () => {
    const { run, factory } = await aiKit(() => ({ answer: "Yes.", evidenceIds: [], caveats: [] }));
    await run("/ai/questions", { question: "How did my remotework posts land?", tz: 0 });
    const prompt = factory.calls[0]?.prompt ?? "";
    expect(prompt).toMatch(/Related post 1 \(.*remotework.*\)/);
    expect(prompt).toMatch(/<post_text evidence="E\d+">\n[^<]*#remotework/);
  });

  it("classifies common questions", () => {
    expect(classifyQuestion("When should I post?")).toBe("timing");
    expect(classifyQuestion("Which hashtags work?")).toBe("topics");
    expect(classifyQuestion("Do videos beat images?")).toBe("formats");
    expect(classifyQuestion("What was my best post?")).toBe("posts");
    expect(classifyQuestion("Summarise my month")).toBe("overview");
  });
});
