import { describe, expect, it } from "vitest";
import { type ExperimentSpec, evaluateExperiment } from "./experiments";
import { type GoalSpec, goalProgress } from "./goals";
import { EMPTY_METRICS } from "./metrics";
import type { PostRecord } from "./posts";

const days = (from: number, values: (number | null)[]) =>
  values.map((value, i) => ({ day: `2026-03-${String(from + i).padStart(2, "0")}`, value }));

const goal = (overrides: Partial<GoalSpec>): GoalSpec => ({
  metric: "impressions",
  target: 1000,
  startDate: "2026-03-01",
  endDate: "2026-03-10",
  ...overrides,
});

const empty = { impressions: [], engagements: [], followers: [], posts: [] };

describe("goalProgress", () => {
  it("measures a sum goal against the share of the window that has passed", () => {
    const inputs = { ...empty, impressions: days(1, [100, 100, null, 100, 100]) };
    // 400 of 1000 after 5 of 10 days: 40% done, 50% expected.
    expect(goalProgress(goal({}), inputs, "2026-03-05")).toMatchObject({
      current: 400,
      progress: 0.4,
      expected: 0.5,
      status: "behind",
    });
  });

  it("measures follower goals as net gain from the start toward the target", () => {
    const inputs = { ...empty, followers: days(1, [1000, null, 1030, 1060]) };
    const result = goalProgress(goal({ metric: "followers", target: 1100 }), inputs, "2026-03-04");
    // baseline 1000, now 1060, target 1100: 60 of 100.
    expect(result).toMatchObject({
      baseline: 1000,
      current: 1060,
      progress: 0.6,
      status: "on_track",
    });
  });

  it("is achieved once the target is reached, and missed if the window ends short", () => {
    const hit = { ...empty, impressions: days(1, [600, 500]) };
    expect(goalProgress(goal({}), hit, "2026-03-02").status).toBe("achieved");
    const short = { ...empty, impressions: days(1, [100]) };
    expect(goalProgress(goal({}), short, "2026-03-20").status).toBe("missed");
  });

  it("reports no data rather than zero progress when nothing was measured", () => {
    expect(goalProgress(goal({}), empty, "2026-03-05")).toMatchObject({
      current: null,
      progress: null,
      status: "no_data",
    });
  });

  it("counts a follower target already reached at the start as achieved", () => {
    const inputs = { ...empty, followers: days(1, [1000, 1010]) };
    expect(
      goalProgress(goal({ metric: "followers", target: 900 }), inputs, "2026-03-02").status,
    ).toBe("achieved");
  });

  it("has not started before its start date", () => {
    expect(goalProgress(goal({}), empty, "2026-02-20").status).toBe("not_started");
  });

  it("averages engagement rate over days that report both figures", () => {
    const inputs = {
      ...empty,
      impressions: days(1, [1000, 1000]),
      engagements: days(1, [30, null]),
    };
    const result = goalProgress(
      goal({ metric: "engagement_rate", target: 0.06 }),
      inputs,
      "2026-03-02",
    );
    expect(result).toMatchObject({ current: 0.03, progress: 0.5, status: "behind" });
  });
});

let n = 0;
const post = (day: string, engagements: number | null): PostRecord => ({
  id: `p${(n += 1)}`,
  externalId: `x${n}`,
  dataset: "linkedin",
  url: null,
  text: null,
  publishedAt: `${day}T09:00:00.000Z`,
  timeKnown: true,
  contentType: "text",
  providers: [],
  topics: [],
  metrics: { ...EMPTY_METRICS, engagements },
  metricsObservedOn: engagements === null ? null : day,
  metricsPeriod: null,
  metricsProvider: null,
});

const spec: ExperimentSpec = {
  metric: "engagements",
  startDate: "2026-03-11",
  endDate: "2026-03-20",
  baseline: null,
};

describe("evaluateExperiment", () => {
  const before = ["2026-03-02", "2026-03-04", "2026-03-06"].map((d, i) =>
    post(d, [10, 20, 30][i] ?? null),
  );
  const during = ["2026-03-12", "2026-03-14", "2026-03-16"].map((d, i) =>
    post(d, [30, 40, 50][i] ?? null),
  );

  it("compares the experiment window's median with the equally long window before it", () => {
    expect(evaluateExperiment(spec, [...before, ...during], "2026-03-25")).toMatchObject({
      baseline: 20,
      observed: 40,
      change: { absolute: 20, percent: 1 },
      verdict: "higher",
      sampleSize: 3,
      baselineSampleSize: 3,
    });
  });

  it("refuses a verdict on fewer than 3 posts either side", () => {
    const result = evaluateExperiment(spec, [...before, ...during.slice(0, 2)], "2026-03-25");
    expect(result.verdict).toBe("insufficient_data");
  });

  it("calls a change under 10% no clear change", () => {
    const flat = ["2026-03-12", "2026-03-14", "2026-03-16"].map((d) => post(d, 21));
    expect(evaluateExperiment(spec, [...before, ...flat], "2026-03-25").verdict).toBe(
      "no_clear_change",
    );
  });

  it("uses a manual baseline when one is given", () => {
    const result = evaluateExperiment({ ...spec, baseline: 80 }, during, "2026-03-25");
    expect(result).toMatchObject({ baseline: 80, observed: 40, verdict: "lower" });
  });

  it("reads any rise from a manual baseline of zero as higher", () => {
    const result = evaluateExperiment({ ...spec, baseline: 0 }, during, "2026-03-25");
    expect(result.verdict).toBe("higher");
  });

  it("ignores posts without the metric instead of counting them as zero", () => {
    const withGaps = [...during, post("2026-03-18", null)];
    expect(evaluateExperiment(spec, [...before, ...withGaps], "2026-03-25").sampleSize).toBe(3);
  });
});
