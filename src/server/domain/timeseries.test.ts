import { describe, expect, it } from "vitest";
import { aggregate, comparePeriods, fillPeriods, rollingAverage } from "./timeseries";

describe("aggregate", () => {
  const values = [
    { day: "2026-03-02", value: 10 }, // Monday
    { day: "2026-03-04", value: null },
    { day: "2026-03-08", value: 5 }, // Sunday, same ISO week
    { day: "2026-03-09", value: 7 }, // next Monday
  ];

  it("sums flows per ISO week and counts only known days", () => {
    expect(aggregate(values, "week", "sum")).toEqual([
      { period: "2026-03-02", value: 15, observedDays: 2 },
      { period: "2026-03-09", value: 7, observedDays: 1 },
    ]);
  });

  it("takes the last known value for stocks instead of summing them", () => {
    const followers = [
      { day: "2026-03-01", value: 100 },
      { day: "2026-03-20", value: 130 },
      { day: "2026-03-31", value: null },
    ];
    expect(aggregate(followers, "month", "last")).toEqual([
      { period: "2026-03-01", value: 130, observedDays: 2 },
    ]);
  });

  it("keeps a bucket with no known values as null, not zero", () => {
    expect(aggregate([{ day: "2026-03-02", value: null }], "day", "sum")[0]?.value).toBeNull();
  });
});

describe("fillPeriods", () => {
  it("inserts null buckets for days without observations", () => {
    const filled = fillPeriods(
      [{ period: "2026-03-01", value: 3, observedDays: 1 }],
      "2026-03-01",
      "2026-03-03",
      "day",
    );
    expect(filled.map((p) => p.value)).toEqual([3, null, null]);
  });
});

describe("rollingAverage", () => {
  it("averages the trailing window over known values only", () => {
    const points = [4, null, 8, 12].map((value, i) => ({
      period: `p${i}`,
      value,
      observedDays: 1,
    }));
    // window 3: [4] -> 4, [4,null] -> 4, [4,null,8] -> 6, [null,8,12] -> 10
    expect(rollingAverage(points, 3).map((p) => p.value)).toEqual([4, 4, 6, 10]);
  });
});

describe("comparePeriods", () => {
  const values = [
    { day: "2026-03-01", value: 10 },
    { day: "2026-03-03", value: 20 },
    { day: "2026-03-04", value: 30 },
    { day: "2026-03-06", value: 15 },
  ];

  it("compares the trailing window with the equally long window before it", () => {
    const result = comparePeriods(values, "2026-03-06", 3, "sum");
    expect(result.current).toMatchObject({ from: "2026-03-04", to: "2026-03-06", value: 45 });
    expect(result.previous).toMatchObject({ from: "2026-03-01", to: "2026-03-03", value: 30 });
    expect(result.change).toEqual({ absolute: 15, percent: 0.5 });
  });

  it("reports coverage so a partial period is not mistaken for a drop", () => {
    const result = comparePeriods(values, "2026-03-06", 3, "sum");
    expect(result.previous.observedDays).toBe(2);
    expect(result.previous.totalDays).toBe(3);
  });

  it("compares daily averages, so a half-covered period is not read as a halving", () => {
    const uneven = [
      { day: "2026-03-01", value: 10 },
      { day: "2026-03-02", value: 10 },
      { day: "2026-03-03", value: 10 },
      { day: "2026-03-04", value: 10 },
    ];
    const result = comparePeriods(uneven, "2026-03-06", 3, "sum");
    expect(result.current.value).toBe(10); // only 3/4 observed
    expect(result.change.percent).toBe(0);
  });

  it("returns no percentage when the previous period has no data", () => {
    const result = comparePeriods(values, "2026-03-12", 3, "sum");
    expect(result.current.value).toBeNull();
    expect(result.change.percent).toBeNull();
  });
});
