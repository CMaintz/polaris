import { describe, expect, it } from "vitest";
import { ruleInsights } from "./insights";
import { EMPTY_METRICS } from "./metrics";
import { type PostRecord, assignBands, postingTimes } from "./posts";

let next = 0;
function post(overrides: Partial<PostRecord> & { engagements?: number | null }): PostRecord {
  next += 1;
  const { engagements = null, ...rest } = overrides;
  return {
    id: `p${next}`,
    externalId: `x${next}`,
    dataset: "linkedin",
    url: null,
    text: null,
    publishedAt: "2026-03-02T08:00:00.000Z",
    timeKnown: true,
    contentType: "text",
    providers: [],
    topics: [],
    metrics: { ...EMPTY_METRICS, engagements },
    metricsObservedOn: engagements === null ? null : "2026-03-10",
    metricsPeriod: null,
    metricsProvider: null,
    ...rest,
  };
}

describe("assignBands", () => {
  it("puts the top and bottom quartiles in bands and posts without metrics in none", () => {
    const posts = [10, 20, 30, 40, 50, null].map((engagements) => post({ engagements }));
    // p25 = 20, p75 = 40 over [10..50]
    const bands = posts.map((p) => assignBands(posts).get(p.id));
    expect(bands).toEqual(["bottom", "bottom", "middle", "top", "top", "unrated"]);
  });

  it("does not rank when there are too few posts or no spread", () => {
    const few = [5, 50, 500].map((engagements) => post({ engagements }));
    expect([...assignBands(few).values()]).toEqual(["middle", "middle", "middle"]);
    const flat = [7, 7, 7, 7].map((engagements) => post({ engagements }));
    expect([...assignBands(flat).values()]).toEqual(["middle", "middle", "middle", "middle"]);
  });
});

describe("postingTimes", () => {
  it("shifts timed posts into the viewer's timezone and leaves date-only posts out of hours", () => {
    const late = post({ publishedAt: "2026-03-01T23:30:00.000Z", engagements: 5 }); // Sunday UTC
    const dateOnly = post({ publishedAt: "2026-03-01T00:00:00.000Z", timeKnown: false });
    const result = postingTimes([late, dateOnly], 120); // UTC+2: Monday 01:30
    expect(result.weekdays.map((s) => [s.key, s.posts]).sort()).toEqual([
      ["0", 1],
      ["6", 1],
    ]);
    expect(result.hours.map((s) => s.key)).toEqual(["1"]);
  });
});

describe("ruleInsights", () => {
  const base = {
    asOf: "2026-03-31",
    impressions: null,
    sources: { posts: "posts", account: "account" },
    tzOffsetMinutes: 0,
  };

  it("calls out a content type that clearly beats the median, with its evidence", () => {
    const posts = [
      ...[100, 120, 110].map((e) => post({ contentType: "document", engagements: e })),
      ...[20, 30, 25, 35].map((e) => post({ contentType: "text", engagements: e })),
    ];
    const insight = ruleInsights({ ...base, posts }).find((i) => i.key === "best-content-type");
    expect(insight?.title).toBe("Document posts perform best");
    // overall median of [100,120,110,20,30,25,35] is 35
    expect(insight?.evidence.map((e) => e.value)).toEqual([110, 35, 3]);
  });

  it("stays quiet when a segment has too few posts to say anything", () => {
    const posts = [
      ...[100, 120].map((e) => post({ contentType: "document", engagements: e })),
      ...[20, 30, 25].map((e) => post({ contentType: "text", engagements: e })),
    ];
    expect(ruleInsights({ ...base, posts }).map((i) => i.key)).not.toContain("best-content-type");
  });

  it("does not report a change in impressions when a period is mostly missing data", () => {
    const sparse = {
      current: { from: "2026-03-04", to: "2026-03-31", value: 900, observedDays: 3, totalDays: 28 },
      previous: {
        from: "2026-02-04",
        to: "2026-03-03",
        value: 300,
        observedDays: 28,
        totalDays: 28,
      },
      change: { absolute: 600, percent: 2 },
    };
    const keys = ruleInsights({ ...base, posts: [], impressions: sparse }).map((i) => i.key);
    expect(keys).not.toContain("impressions-change");
  });

  it("says nothing about posting frequency when the archive does not cover both windows", () => {
    // 8 posts in the earlier window, none after 2/11: the archive ends there, so the last
    // 28 days are not "no posts", they are unknown.
    const posts = [4, 5, 6, 7, 8, 9, 10, 11].map((d) =>
      post({
        publishedAt: `2026-02-${String(d).padStart(2, "0")}T08:00:00.000Z`,
        providers: ["linkedin-data-export"],
      }),
    );
    const keys = ruleInsights({ ...base, posts }).map((i) => i.key);
    expect(keys).not.toContain("cadence-change");
  });

  it("flags a recent post with at least twice the median engagements", () => {
    const posts = [10, 12, 11, 9, 50].map((e, i) =>
      post({ engagements: e, publishedAt: `2026-03-1${i}T08:00:00.000Z` }),
    );
    const insight = ruleInsights({ ...base, posts }).find((i) => i.key === "outlier-post");
    expect(insight?.evidence[0]).toMatchObject({ value: 50, postId: posts[4]?.id });
  });
});
