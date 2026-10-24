import { describe, expect, it } from "vitest";
import {
  baselineWindow,
  campaignPerformance,
  campaignPostIds,
  followerChange,
  measuredWindow,
} from "./campaigns";
import { publishedPost } from "../testing/post-records";

const post = (day: string, impressions: number | null) => publishedPost(day, { impressions });

const followers = (from: number, values: (number | null)[]) =>
  values.map((value, i) => ({ day: `2026-03-${String(from + i).padStart(2, "0")}`, value }));

describe("campaign windows", () => {
  it("measures only the days that have happened, and nothing before the start", () => {
    expect(measuredWindow("2026-03-10", "2026-03-20", "2026-03-14")).toEqual({
      from: "2026-03-10",
      to: "2026-03-14",
    });
    expect(measuredWindow("2026-03-10", "2026-03-20", "2026-03-30")?.to).toBe("2026-03-20");
    expect(measuredWindow("2026-03-10", "2026-03-20", "2026-03-09")).toBeNull();
  });

  it("takes a baseline exactly as long as the window, ending the day before it", () => {
    expect(baselineWindow({ from: "2026-03-10", to: "2026-03-14" })).toEqual({
      from: "2026-03-05",
      to: "2026-03-09",
    });
  });
});

describe("campaignPostIds", () => {
  it("counts posts linked directly and through linked plan items, once each", () => {
    const ids = campaignPostIds(["a", "b"], [{ postId: "b" }, { postId: "c" }, { postId: null }]);
    expect([...ids].sort()).toEqual(["a", "b", "c"]);
  });
});

describe("followerChange", () => {
  it("is the count at the end minus the count on the day before the window", () => {
    const series = followers(4, [100, 105, null, 120]);
    expect(followerChange(series, { from: "2026-03-05", to: "2026-03-07" })).toEqual({
      value: 20,
      observedDays: 2,
      totalDays: 3,
    });
  });

  it("is unknown when either edge has no follower count, however many days inside do", () => {
    const series = followers(5, [105, 110, 120]);
    expect(followerChange(series, { from: "2026-03-05", to: "2026-03-07" }).value).toBeNull();
  });
});

describe("campaignPerformance", () => {
  const linked = [post("2026-03-11", 300), post("2026-03-12", 500)];
  const before = [post("2026-03-06", 100), post("2026-03-08", 200)];
  // Fixes the archive's coverage from 2026-03-01 so the baseline window is fully listed.
  const all = [post("2026-03-01", null), ...before, ...linked, post("2026-03-13", 900)];

  it("compares the linked posts with the account's posts in the baseline window", () => {
    const result = campaignPerformance({
      window: { from: "2026-03-10", to: "2026-03-14" },
      linked,
      all,
      followers: [],
    });
    expect(result.campaign.posts).toMatchObject({ posts: 2, medianImpressions: 400 });
    expect(result.baseline.posts).toMatchObject({ posts: 2, medianImpressions: 150 });
    expect(result.baseline.postsPublished).toEqual({ value: 2, observedDays: 5, totalDays: 5 });
  });

  it("leaves a linked post published inside the baseline window out of the baseline", () => {
    const early = post("2026-03-07", 5000);
    const result = campaignPerformance({
      window: { from: "2026-03-10", to: "2026-03-14" },
      linked: [early],
      all: [...all, early],
      followers: [],
    });
    expect(result.baseline.posts.medianImpressions).toBe(150);
  });

  it("does not count baseline posts on days the archive does not cover", () => {
    const result = campaignPerformance({
      window: { from: "2026-03-10", to: "2026-03-14" },
      linked,
      all: [post("2026-03-08", 100), ...linked],
      followers: [],
    });
    // Coverage starts on 2026-03-08, so only 2 of the 5 baseline days are measurable.
    expect(result.baseline.postsPublished).toEqual({ value: 1, observedDays: 2, totalDays: 5 });
  });

  it("reports no baseline post count at all when the archive does not reach it", () => {
    const result = campaignPerformance({
      window: { from: "2026-03-10", to: "2026-03-14" },
      linked,
      all: linked,
      followers: [],
    });
    expect(result.baseline.postsPublished).toEqual({ value: null, observedDays: 0, totalDays: 5 });
  });
});
