import { daysBetween, isWithin } from "./dates";
import { sumOrNull } from "./stats";
import type { DatedValue } from "./timeseries";

export type GoalMetric = "followers" | "impressions" | "engagements" | "posts" | "engagement_rate";

export interface GoalSpec {
  metric: GoalMetric;
  target: number;
  startDate: string;
  endDate: string;
}

export interface GoalInputs {
  impressions: DatedValue[];
  engagements: DatedValue[];
  followers: DatedValue[];
  /** Posts per day, only for days the archive covers (see dailyPostCounts). */
  posts: DatedValue[];
}

type GoalStatus = "not_started" | "no_data" | "on_track" | "behind" | "achieved" | "missed";

export interface GoalProgress {
  current: number | null;
  /** Followers at the start, for follower goals; otherwise null. */
  baseline: number | null;
  /** Fraction of the target reached, 0 to 1 and beyond. */
  progress: number | null;
  /** Fraction of the goal's window that has passed. */
  expected: number;
  status: GoalStatus;
  measuredUntil: string;
}

const known = (values: DatedValue[], from: string, to: string) =>
  values
    .filter((v) => v.value !== null && isWithin(v.day, from, to))
    .sort((a, b) => a.day.localeCompare(b.day));

function measure(goal: GoalSpec, inputs: GoalInputs, to: string) {
  const { startDate: from } = goal;
  if (goal.metric === "followers") return followerGain(inputs.followers, from, to);
  if (goal.metric === "engagement_rate")
    return { current: pairedRate(inputs, from, to), baseline: null };
  const series = inputs[goal.metric];
  return { current: sumOrNull(known(series, from, to).map((v) => v.value)), baseline: null };
}

/** Follower goals count net gain: the target is an absolute count, progress starts at day one. */
function followerGain(followers: DatedValue[], from: string, to: string) {
  const before = known(followers, "0000-01-01", from).at(-1);
  const inside = known(followers, from, to);
  const baseline = before?.value ?? inside[0]?.value ?? null;
  return { current: inside.at(-1)?.value ?? null, baseline };
}

function pairedRate(inputs: GoalInputs, from: string, to: string): number | null {
  const engagements = new Map(
    known(inputs.engagements, from, to).map((v) => [v.day, v.value as number]),
  );
  const paired = known(inputs.impressions, from, to).filter((v) => engagements.has(v.day));
  const impressions = paired.reduce((t, v) => t + (v.value as number), 0);
  if (impressions === 0) return null;
  return paired.reduce((t, v) => t + (engagements.get(v.day) ?? 0), 0) / impressions;
}

function fractionOfTarget(goal: GoalSpec, current: number, baseline: number | null): number | null {
  if (goal.metric !== "followers") return goal.target === 0 ? null : current / goal.target;
  if (baseline === null) return null;
  // A target at or below the starting count is met as soon as the count is at the target.
  if (goal.target <= baseline) return current >= goal.target ? 1 : 0;
  return (current - baseline) / (goal.target - baseline);
}

export function goalProgress(goal: GoalSpec, inputs: GoalInputs, asOf: string): GoalProgress {
  const to = asOf < goal.endDate ? asOf : goal.endDate;
  const total = daysBetween(goal.startDate, goal.endDate) + 1;
  const expected = Math.min(1, Math.max(0, (daysBetween(goal.startDate, to) + 1) / total));
  const base = { expected, measuredUntil: to };
  if (asOf < goal.startDate)
    return { ...base, current: null, baseline: null, progress: null, status: "not_started" };
  const { current, baseline } = measure(goal, inputs, to);
  const progress = current === null ? null : fractionOfTarget(goal, current, baseline);
  return { ...base, current, baseline, progress, status: statusOf(goal, progress, expected, asOf) };
}

function statusOf(
  goal: GoalSpec,
  progress: number | null,
  expected: number,
  asOf: string,
): GoalStatus {
  if (progress === null) return "no_data";
  if (progress >= 1) return "achieved";
  if (asOf >= goal.endDate) return "missed";
  // A rate is not cumulative, so "on track" means already at or above the target.
  if (goal.metric === "engagement_rate") return "behind";
  return progress >= expected ? "on_track" : "behind";
}
