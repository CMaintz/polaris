import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { funnelPeriods, funnelWindow } from "./funnel";

const daily = (from: string, values: (number | null)[]) =>
  values.map((value, i) => ({ day: addDays(from, i), value }));

// 2026-03-02 is a Monday; ten days cover one full week and three days of the next.
const tenDays = {
  impressions: daily("2026-03-02", Array(10).fill(100)),
  engagements: daily("2026-03-02", Array(10).fill(5)),
  newFollowers: daily("2026-03-02", Array(10).fill(1)),
};

describe("funnelPeriods", () => {
  it("sums each stage per week and blanks a partial edge week with its conversions", () => {
    const [full, partial] = funnelPeriods(tenDays, "week", {
      from: "2026-03-02",
      to: "2026-03-11",
    });
    expect(full).toMatchObject({
      period: "2026-03-02",
      to: "2026-03-08",
      impressions: { value: 700, observedDays: 7 },
      engagements: { value: 35 },
      newFollowers: { value: 7 },
      engagementRate: { value: 0.05, pairedDays: 7 },
      // 7 new followers over 700 impressions.
      followerConversion: { value: 10, pairedDays: 7 },
    });
    expect(partial).toMatchObject({
      impressions: { value: null, observedDays: 3 },
      engagementRate: { value: null },
      followerConversion: { value: null },
      to: "2026-03-11",
    });
  });

  it("shows profile views as unavailable with a reason, never as zero", () => {
    const [step] = funnelPeriods(tenDays, "week", { from: "2026-03-02", to: "2026-03-08" });
    expect(step?.profileViews.value).toBeNull();
    expect(step?.profileViews.reason).toMatch(/not in the LinkedIn exports/);
  });

  it("keeps a missing stage unknown in a period where others have data", () => {
    const inputs = { ...tenDays, newFollowers: [] };
    const [step] = funnelPeriods(inputs, "week", { from: "2026-03-02", to: "2026-03-08" });
    expect(step?.newFollowers).toEqual({ value: null, observedDays: 0 });
    expect(step?.followerConversion.value).toBeNull();
  });
});

describe("funnelWindow", () => {
  it("totals an explicit window without blanking it and reports days with data", () => {
    const inputs = { ...tenDays, impressions: daily("2026-03-02", [100, null, 100]) };
    const step = funnelWindow(inputs, { from: "2026-03-02", to: "2026-03-04" });
    expect(step).toMatchObject({
      totalDays: 3,
      impressions: { value: 200, observedDays: 2 },
      engagements: { value: 15, observedDays: 3 },
      engagementRate: { value: 0.05, pairedDays: 2 },
    });
  });
});
