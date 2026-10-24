import { PERIOD_DAYS, RECENT_DAYS, addDays, dayOf, isWithin, lastDays } from "./dates";
import { postMetricValue } from "./metrics";
import {
  type PostRecord,
  isFullyListed,
  postCountCoverage,
  type SegmentPerformance,
  postingTimes,
  segmentPerformance,
  summarisePosts,
} from "./posts";
import { growth, median } from "./stats";
import type { PeriodComparison } from "./timeseries";

export type Confidence = "low" | "medium" | "high";

/** A fact an insight rests on. Every value here comes from stored data, never from a model. */
export interface EvidenceItem {
  id: string;
  label: string;
  value: number | null;
  unit: "count" | "ratio";
  postId?: string;
  period?: { from: string; to: string };
  source: string;
}

/** Structured as docs/03 section 5 asks: observation, evidence, interpretation, and so on. */
export interface Insight {
  key: string;
  title: string;
  observation: string;
  interpretation: string;
  action: string;
  signal: string;
  confidence: Confidence;
  evidence: EvidenceItem[];
}

export interface InsightInputs {
  posts: PostRecord[];
  asOf: string;
  impressions: PeriodComparison | null;
  sources: { posts: string; account: string };
  tzOffsetMinutes: number;
}

// A segment must beat the overall median by this factor to be called out.
const LIFT = 1.2;
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;
const perDay = (p: { value: number | null; observedDays: number }) =>
  p.value === null || p.observedDays === 0 ? null : Math.round(p.value / p.observedDays);

export function ruleInsights(inputs: InsightInputs): Insight[] {
  const { posts } = inputs;
  const types = segmentPerformance(posts, (p) =>
    p.contentType === "unknown" ? [] : [p.contentType],
  );
  return [
    impressionsChange(inputs),
    bestSegment(inputs, "content-type", types),
    bestSegment(
      inputs,
      "topic",
      segmentPerformance(posts, (p) => p.topics),
    ),
    bestSegment(inputs, "weekday", postingTimes(posts, inputs.tzOffsetMinutes).weekdays),
    outlierPost(inputs),
    cadenceChange(inputs),
  ].filter((insight): insight is Insight => insight !== null);
}

function impressionsChange({ impressions, sources }: InsightInputs): Insight | null {
  if (!impressions) return null;
  const { current, previous, change } = impressions;
  const covered = (p: typeof current) => p.observedDays / p.totalDays;
  if (change.percent === null || covered(current) < 0.5 || covered(previous) < 0.5) return null;
  if (Math.abs(change.percent) < 0.1) return null;
  const up = change.percent > 0;
  return {
    key: "impressions-change",
    title: `Impressions ${up ? "up" : "down"} ${pct(Math.abs(change.percent))}`,
    observation: `Impressions averaged ${perDay(current)} a day over the last ${current.totalDays} days (${current.observedDays} days with data), against ${perDay(previous)} a day in the ${previous.totalDays} days before (${previous.observedDays} days with data).`,
    interpretation: up
      ? "Your content reached noticeably more people. Check which posts drove it before changing course."
      : "Reach fell. It can be posting less often, weaker topics, or ordinary fluctuation.",
    action: up
      ? "Look at the top posts of the period and consider repeating their format or topic."
      : "Compare this period's posts with the previous period's top posts.",
    signal: "Impressions over the next period, compared with this one.",
    confidence: covered(current) >= 0.9 && covered(previous) >= 0.9 ? "high" : "medium",
    evidence: [
      {
        id: "e1",
        label: "Impressions, current period",
        value: current.value,
        unit: "count",
        period: { from: current.from, to: current.to },
        source: sources.account,
      },
      {
        id: "e2",
        label: "Impressions, previous period",
        value: previous.value,
        unit: "count",
        period: { from: previous.from, to: previous.to },
        source: sources.account,
      },
    ],
  };
}

const SEGMENT_TEXT: Record<
  string,
  { name: (key: string) => string; minPosts: number; minGroups: number }
> = {
  "content-type": { name: (k) => `${k} posts`, minPosts: 3, minGroups: 2 },
  topic: { name: (k) => `posts tagged #${k}`, minPosts: 3, minGroups: 2 },
  weekday: { name: (k) => `posts published on ${WEEKDAYS[Number(k)]}`, minPosts: 2, minGroups: 3 },
};

function bestSegment(
  inputs: InsightInputs,
  kind: string,
  segments: SegmentPerformance[],
): Insight | null {
  const rules = SEGMENT_TEXT[kind];
  if (!rules) return null;
  const eligible = segments.filter(
    (s) => s.withMetrics >= rules.minPosts && s.medianEngagements !== null,
  );
  const overall = summarisePosts("all", inputs.posts).medianEngagements;
  const best = eligible[0];
  if (
    !best ||
    eligible.length < rules.minGroups ||
    !overall ||
    (best.medianEngagements ?? 0) < overall * LIFT
  ) {
    return null;
  }
  return segmentInsight(kind, rules.name(best.key), best, overall, inputs.sources.posts);
}

function segmentInsight(
  kind: string,
  name: string,
  best: SegmentPerformance,
  overall: number,
  source: string,
): Insight {
  const lift = (best.medianEngagements as number) / overall;
  return {
    key: `best-${kind}`,
    title: `${name[0]?.toUpperCase()}${name.slice(1)} perform best`,
    observation: `The median ${name} got ${best.medianEngagements} engagements, ${lift.toFixed(1)} times your overall median of ${overall}.`,
    interpretation:
      "This is a pattern in your own history, not proof of cause: other differences between these posts may explain it.",
    action: `Plan a few more ${name} and see whether the pattern holds.`,
    signal: `Median engagements of new ${name} against the overall median.`,
    confidence: best.withMetrics >= 8 ? "medium" : "low",
    evidence: [
      {
        id: "e1",
        label: `Median engagements, ${name}`,
        value: best.medianEngagements,
        unit: "count",
        source,
      },
      { id: "e2", label: "Median engagements, all posts", value: overall, unit: "count", source },
      {
        id: "e3",
        label: `Posts with metrics, ${name}`,
        value: best.withMetrics,
        unit: "count",
        source,
      },
    ],
  };
}

const engagementsOf = (p: PostRecord) => postMetricValue(p.metrics, "engagements");

function outlierPost({ posts, asOf, sources }: InsightInputs): Insight | null {
  const recentWindow = lastDays(asOf, RECENT_DAYS);
  const recent = posts.filter(
    (p) => p.publishedAt && isWithin(dayOf(p.publishedAt), recentWindow.from, recentWindow.to),
  );
  const typical = median(recent.map(engagementsOf));
  const rated = recent.filter((p) => engagementsOf(p) !== null);
  const top = [...rated].sort((a, b) => (engagementsOf(b) ?? 0) - (engagementsOf(a) ?? 0))[0];
  const value = top ? engagementsOf(top) : null;
  if (!top || rated.length < 5 || !typical || value === null || value < typical * 2) return null;
  return {
    key: "outlier-post",
    title: "One recent post far outperformed the rest",
    observation: `A post from ${dayOf(top.publishedAt as string)} got ${value} engagements, against a 90-day median of ${typical}.`,
    interpretation:
      "Outliers often show what your audience reacts to most strongly: topic, format, or a hook.",
    action: "Open the post and note what was different about it.",
    signal: "Whether follow-up posts in the same style beat the median.",
    confidence: "medium",
    evidence: [
      {
        id: "e1",
        label: "Engagements on the post",
        value,
        unit: "count",
        postId: top.id,
        source: sources.posts,
      },
      {
        id: "e2",
        label: "90-day median engagements",
        value: typical,
        unit: "count",
        period: recentWindow,
        source: sources.posts,
      },
    ],
  };
}

function cadenceChange({ posts, asOf, sources }: InsightInputs): Insight | null {
  const coverage = postCountCoverage(posts);
  const currentWindow = lastDays(asOf, PERIOD_DAYS);
  const previousWindow = lastDays(addDays(asOf, -PERIOD_DAYS), PERIOD_DAYS);
  // Both windows must lie inside the archive's range, or a missing export reads as silence.
  if (!coverage || coverage.from > previousWindow.from || coverage.to < asOf) return null;
  const listed = posts.filter(isFullyListed);
  const count = ({ from, to }: { from: string; to: string }) =>
    listed.filter((p) => p.publishedAt && isWithin(dayOf(p.publishedAt), from, to)).length;
  const current = count(currentWindow);
  const previous = count(previousWindow);
  const change = growth(previous, current);
  if (previous < 4 || change.percent === null || Math.abs(change.percent) < 0.5) return null;
  const fewer = current < previous;
  return {
    key: "cadence-change",
    title: fewer ? "You are posting less often" : "You are posting more often",
    observation: `${current} posts in the last 28 days, against ${previous} in the 28 days before.`,
    interpretation: fewer
      ? "Posting frequency usually moves reach; a drop in impressions may follow."
      : "More posts give the audience more to react to, but watch per-post engagement.",
    action: fewer
      ? "Use the planner to schedule your next posts."
      : "Check that per-post engagement is holding up.",
    signal: "Impressions and median engagements per post over the next 28 days.",
    confidence: "high",
    evidence: [
      {
        id: "e1",
        label: "Posts, last 28 days",
        value: current,
        unit: "count",
        period: currentWindow,
        source: sources.posts,
      },
      {
        id: "e2",
        label: "Posts, previous 28 days",
        value: previous,
        unit: "count",
        period: previousWindow,
        source: sources.posts,
      },
    ],
  };
}
