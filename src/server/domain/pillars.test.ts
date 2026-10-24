import { describe, expect, it } from "vitest";
import { type PillarSpec, normaliseTopic, pillarReport } from "./pillars";
import { publishedPost } from "../testing/post-records";

const post = (day: string, topics: string[], fullyListed = true, impressions = 100) =>
  publishedPost(day, { topics, fullyListed, impressions });

const pillar = (id: string, topics: string[], targetShare: number): PillarSpec => ({
  id,
  topics,
  targetShare,
});

const window = { from: "2026-03-01", to: "2026-03-31" };

// Ten archive posts: six #ai (one also #careers), three #careers, one untagged.
const posts = [
  ...Array.from({ length: 5 }, (_v, i) => post(`2026-03-0${i + 1}`, ["ai"], true, 100 * (i + 1))),
  post("2026-03-06", ["ai", "careers"]),
  post("2026-03-07", ["careers"]),
  post("2026-03-08", ["careers"]),
  post("2026-03-09", ["careers"]),
  post("2026-03-10", []),
];

describe("pillarReport", () => {
  it("shares posts by pillar, counting a post in every pillar it matches", () => {
    const report = pillarReport(
      [pillar("a", ["ai"], 0.5), pillar("c", ["careers"], 0.2)],
      posts,
      window,
    );
    expect(report.posts).toBe(10);
    expect(report.pillars.map((p) => p.actualShare)).toEqual([0.6, 0.4]);
    expect(report.unassigned).toEqual({ posts: 1, share: 0.1 });
  });

  it("flags under- and over-served pillars beyond the tolerance and on target within it", () => {
    const report = pillarReport(
      [pillar("a", ["ai"], 0.9), pillar("c", ["careers"], 0.2), pillar("x", ["ai"], 0.58)],
      posts,
      window,
    );
    expect(report.pillars.map((p) => p.status)).toEqual(["under", "over", "on_target"]);
    expect(report.pillars[0]?.gap).toBeCloseTo(-0.3);
  });

  it("gives the median performance of the pillar's posts", () => {
    const report = pillarReport([pillar("a", ["ai"], 0.5)], posts, window);
    // impressions 100..500 and 100: median of [100, 100, 200, 300, 400, 500]
    expect(report.pillars[0]?.performance.medianImpressions).toBe(250);
  });

  it("counts only days the archive covers, ignoring posts from top-post exports", () => {
    const withExport = [...posts, post("2026-03-20", ["ai"], false)];
    const report = pillarReport([pillar("a", ["ai"], 0.5)], withExport, window);
    expect(report.posts).toBe(10);
    expect(report.measured).toEqual({ from: "2026-03-01", to: "2026-03-10" });
    expect(report.measuredDays).toBe(10);
    expect(report.totalDays).toBe(31);
  });

  it("has no share at all when the window lies outside the archive's coverage", () => {
    const report = pillarReport([pillar("a", ["ai"], 0.5)], posts, {
      from: "2026-04-01",
      to: "2026-04-30",
    });
    expect(report.measured).toBeNull();
    expect(report.pillars[0]).toMatchObject({ actualShare: null, gap: null, status: "no_data" });
  });

  it("does not judge a gap from too few posts", () => {
    const report = pillarReport([pillar("a", ["ai"], 0.9)], posts.slice(0, 3), window);
    expect(report.pillars[0]).toMatchObject({ actualShare: 1, status: "too_few_posts" });
  });
});

describe("normaliseTopic", () => {
  it("matches hashtag topics however the user typed them", () => {
    expect(normaliseTopic(" #AI ")).toBe("ai");
  });
});
