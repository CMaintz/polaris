import { describe, expect, it } from "vitest";
import { EMPTY_METRICS, engagementRate, mergeMetrics, totalEngagements } from "./metrics";
import { growth, median, percentile } from "./stats";

describe("totalEngagements", () => {
  it("prefers the provider-reported total", () => {
    expect(totalEngagements({ ...EMPTY_METRICS, engagements: 42, reactions: 1 })).toBe(42);
  });

  it("sums the parts when all are known", () => {
    expect(totalEngagements({ ...EMPTY_METRICS, reactions: 10, comments: 3, reposts: 2 })).toBe(15);
  });

  it("is unknown when any part is missing, rather than a misleading partial sum", () => {
    expect(totalEngagements({ ...EMPTY_METRICS, reactions: 10, reposts: 2 })).toBeNull();
  });
});

describe("engagementRate", () => {
  it("divides engagements by impressions", () => {
    expect(engagementRate({ ...EMPTY_METRICS, engagements: 25, impressions: 1000 })).toBe(0.025);
  });

  it("is unknown without impressions or with zero impressions", () => {
    expect(engagementRate({ ...EMPTY_METRICS, engagements: 25 })).toBeNull();
    expect(engagementRate({ ...EMPTY_METRICS, engagements: 0, impressions: 0 })).toBeNull();
  });
});

describe("mergeMetrics", () => {
  it("lets a later observation update values without erasing ones it did not report", () => {
    const earlier = { ...EMPTY_METRICS, impressions: 100, reactions: 5 };
    const later = { ...EMPTY_METRICS, impressions: 150 };
    expect(mergeMetrics(earlier, later)).toMatchObject({ impressions: 150, reactions: 5 });
  });
});

describe("stats", () => {
  it("interpolates percentiles and ignores unknown values", () => {
    expect(percentile([1, 2, 3, 4, null], 0.25)).toBe(1.75);
    expect(median([5, null, 1, 3])).toBe(3);
    expect(median([null])).toBeNull();
  });

  it("measures growth from a negative base by its magnitude", () => {
    expect(growth(-10, -5)).toEqual({ absolute: 5, percent: 0.5 });
    expect(growth(0, 5)).toEqual({ absolute: 5, percent: null });
  });
});
