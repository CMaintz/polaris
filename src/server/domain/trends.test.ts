import { describe, expect, it } from "vitest";
import { dedupeKey, itemDay, matchTopics, trendScores } from "./trends";

describe("matchTopics", () => {
  it("matches whole words only, so a topic is not found inside a longer word", () => {
    expect(matchTopics("AI is changing hiring", ["ai", "hiring"])).toEqual(["ai", "hiring"]);
    expect(matchTopics("Said the chair", ["ai"])).toEqual([]);
  });

  it("matches a hashtag topic written as separate words", () => {
    expect(matchTopics("Notes on Product Engineering teams", ["productengineering"])).toEqual([
      "productengineering",
    ]);
  });

  it("ignores one-letter topics, which would match almost any text", () => {
    expect(matchTopics("a b c", ["a"])).toEqual([]);
  });
});

describe("dedupeKey", () => {
  it("prefers the guid, falls back to the link, and gives up without either", () => {
    expect(dedupeKey(" urn:1 ", "https://x.test/a")).toBe("guid:urn:1");
    expect(dedupeKey(null, "https://x.test/a")).toBe("link:https://x.test/a");
    expect(dedupeKey("  ", null)).toBeNull();
  });
});

describe("itemDay", () => {
  it("uses the fetch day when a feed claims a publish date in the future", () => {
    expect(itemDay("2030-01-01T00:00:00Z", "2026-03-15T08:00:00Z")).toBe("2026-03-15");
    expect(itemDay("2026-03-10T23:00:00Z", "2026-03-15T08:00:00Z")).toBe("2026-03-10");
    expect(itemDay(null, "2026-03-15T08:00:00Z")).toBe("2026-03-15");
  });
});

describe("trendScores", () => {
  it("counts matched items per topic inside each trailing window, today included", () => {
    const matches = [
      { day: "2026-03-15", topics: ["ai"] },
      { day: "2026-03-09", topics: ["ai", "hiring"] },
      { day: "2026-03-08", topics: ["ai"] },
      { day: "2026-01-01", topics: ["ai"] },
    ];
    const scores = trendScores(matches, ["ai", "hiring", "remote"], "2026-03-15");
    expect(scores).toEqual([
      { topic: "ai", last7: 2, last30: 3, last90: 4 },
      { topic: "hiring", last7: 1, last30: 1, last90: 1 },
      { topic: "remote", last7: 0, last30: 0, last90: 0 },
    ]);
  });
});
