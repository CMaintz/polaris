import { describe, expect, it } from "vitest";
import { EMPTY_METRICS } from "./metrics";
import type { PostRecord } from "./posts";
import { emergingThemes, groundThemes, themePerformance } from "./themes";

let next = 0;
function post(day: string, overrides: Partial<PostRecord> & { engagements?: number } = {}) {
  next += 1;
  const { engagements = null, ...rest } = overrides;
  const record: PostRecord = {
    id: `p${next}`,
    externalId: `x${next}`,
    dataset: "linkedin",
    url: null,
    text: "text",
    publishedAt: `${day}T08:00:00.000Z`,
    timeKnown: true,
    contentType: "text",
    providers: ["linkedin-data-export"],
    topics: [],
    metrics: { ...EMPTY_METRICS, engagements },
    metricsObservedOn: null,
    metricsPeriod: null,
    metricsProvider: null,
    ...rest,
  };
  return record;
}

describe("groundThemes", () => {
  const ids = new Map([
    ["P1", "post-a"],
    ["P2", "post-b"],
  ]);

  it("drops post ids the model invented and themes left without a real post", () => {
    const themes = groundThemes(
      [
        { name: "Hiring", description: "d", postIds: ["P1", "P99", "post-b"] },
        { name: "Ghost", description: "d", postIds: ["P7"] },
      ],
      ids,
    );
    expect(themes).toEqual([{ name: "Hiring", description: "d", postIds: ["post-a"] }]);
  });

  it("merges themes whose names differ only in case or spacing", () => {
    const themes = groundThemes(
      [
        { name: "Remote  work", description: "first", postIds: ["P1"] },
        { name: " remote work", description: "second", postIds: ["P2", "P1"] },
      ],
      ids,
    );
    expect(themes).toEqual([
      { name: "Remote work", description: "first", postIds: ["post-a", "post-b"] },
    ]);
  });
});

describe("themePerformance", () => {
  it("summarises each theme over its own posts, counting a post in every theme it has", () => {
    const [a, b, c] = [
      post("2026-01-01", { engagements: 10 }),
      post("2026-01-02", { engagements: 30 }),
      post("2026-01-03"),
    ];
    const rows = themePerformance([a, b, c] as PostRecord[], [
      { name: "Hiring", description: "h", postIds: [a.id, b.id] },
      { name: "Culture", description: "c", postIds: [b.id, c.id] },
    ]);
    expect(rows).toEqual([
      expect.objectContaining({
        theme: "Culture",
        posts: 2,
        withMetrics: 1,
        medianEngagements: 30,
      }),
      expect.objectContaining({ theme: "Hiring", posts: 2, withMetrics: 2, medianEngagements: 20 }),
    ]);
  });
});

describe("emergingThemes", () => {
  // Coverage ends 2026-06-29: latest window 2026-04-01..06-29, previous 2026-01-01..03-31.
  const end = post("2026-06-29");

  it("reports a theme as emerging when its share of posts grows by 10 points or more", () => {
    const previous = ["2026-01-10", "2026-02-10", "2026-03-10", "2026-03-20"].map((d) => post(d));
    const latest = ["2026-04-10", "2026-05-10", "2026-06-10"].map((d) => post(d));
    const posts = [...previous, ...latest, end];
    const hiring = [previous[0], latest[0], latest[1]].map((p) => p.id);
    const result = emergingThemes(
      posts,
      [{ name: "Hiring", description: "", postIds: hiring }],
      new Set(posts.map((p) => p.id)),
    );
    expect(result.windows?.previous).toMatchObject({
      from: "2026-01-01",
      to: "2026-03-31",
      posts: 4,
    });
    expect(result.emerging[0]).toMatchObject({
      theme: "Hiring",
      latestShare: 0.5,
      previousShare: 0.25,
      status: "emerging",
    });
  });

  it("says insufficient, not emerging, when the imports do not cover the previous window", () => {
    const latest = ["2026-05-01", "2026-05-10", "2026-06-10"].map((d) => post(d));
    const posts = [...latest, end];
    const result = emergingThemes(
      posts,
      [{ name: "Hiring", description: "", postIds: [latest[0].id] }],
      new Set(posts.map((p) => p.id)),
    );
    expect(result.windows?.previous.coveredDays).toBe(0);
    expect(result.emerging[0]).toMatchObject({
      previousShare: null,
      change: null,
      status: "insufficient",
    });
  });

  it("counts only classified posts from sources that list every post", () => {
    const listed = ["2026-04-10", "2026-05-10", "2026-06-10"].map((d) => post(d));
    const topOnly = post("2026-05-15", { providers: ["linkedin-analytics-export"] });
    const unclassified = post("2026-05-20");
    const posts = [...listed, topOnly, unclassified, end];
    const classified = new Set([...listed, end, topOnly].map((p) => p.id));
    const result = emergingThemes(
      posts,
      [{ name: "Hiring", description: "", postIds: [listed[0].id] }],
      classified,
    );
    expect(result.windows?.latest.posts).toBe(4);
    expect(result.emerging[0]?.latestShare).toBe(0.25);
  });

  it("has no windows when no source lists every post", () => {
    const posts = [post("2026-05-01", { providers: ["linkedin-analytics-export"] })];
    expect(emergingThemes(posts, [], new Set())).toEqual({ windows: null, emerging: [] });
  });
});
