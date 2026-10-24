import { describe, expect, it } from "vitest";
import type { KpiDto } from "../../../shared/analytics-types";
import { type Loaded, rateKpi } from "./account-series";

const day = (d: string, impressions: number | null, engagements: number | null) => ({
  day: d,
  impressions,
  engagements,
  followers: null,
  newFollowers: null,
  provider: "linkedin-analytics-export",
});

describe("rateKpi", () => {
  it("only counts days that report both impressions and engagements", () => {
    const data: Loaded = {
      account: null,
      posts: [],
      bands: new Map(),
      asOf: "2026-03-03",
      days: [
        day("2026-03-01", 1000, 30),
        day("2026-03-02", 1000, null),
        day("2026-03-03", 1000, 10),
      ],
    };
    const impressions = {
      period: { from: "2026-03-01", to: "2026-03-03" },
      previousPeriod: { from: "2026-02-26", to: "2026-02-28" },
      coverage: { observedDays: 3, totalDays: 3 },
    } as KpiDto;
    const rate = rateKpi(data, impressions);
    // 40 engagements over the 2000 impressions of the two paired days, not over 3000.
    expect(rate.value).toBe(0.02);
    expect(rate.coverage).toEqual({ observedDays: 2, totalDays: 3 });
    expect(rate.previous).toBeNull();
  });
});
