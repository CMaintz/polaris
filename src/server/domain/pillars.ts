import type { DayWindow } from "./campaigns";
import { dayOf, daysBetween, isWithin } from "./dates";
import {
  type PostRecord,
  type SegmentPerformance,
  isFullyListed,
  postCountCoverage,
  summarisePosts,
} from "./posts";

export interface PillarSpec {
  id: string;
  topics: readonly string[];
  /** Planned share of posts, 0 to 1. */
  targetShare: number;
}

export type PillarStatus = "under" | "over" | "on_target" | "too_few_posts" | "no_data";

export interface PillarActual {
  pillarId: string;
  posts: number;
  actualShare: number | null;
  gap: number | null;
  status: PillarStatus;
  performance: SegmentPerformance;
}

export interface PillarReport {
  window: DayWindow;
  measured: DayWindow | null;
  measuredDays: number;
  totalDays: number;
  posts: number;
  unassigned: { posts: number; share: number | null };
  pillars: PillarActual[];
}

// A gap within five percentage points is noise for a personal posting plan (ADR 0023).
const TOLERANCE = 0.05;
const MIN_POSTS = 5;

export function normaliseTopic(topic: string): string {
  return topic.trim().replace(/^#/, "").toLowerCase();
}

function measuredPart(posts: readonly PostRecord[], window: DayWindow): DayWindow | null {
  const coverage = postCountCoverage(posts);
  if (!coverage) return null;
  const from = coverage.from > window.from ? coverage.from : window.from;
  const to = coverage.to < window.to ? coverage.to : window.to;
  return from <= to ? { from, to } : null;
}

function countedPosts(posts: readonly PostRecord[], measured: DayWindow): PostRecord[] {
  return posts.filter(
    (p) => isFullyListed(p) && isWithin(dayOf(p.publishedAt as string), measured.from, measured.to),
  );
}

function statusOf(share: number | null, target: number, counted: number): PillarStatus {
  if (share === null) return "no_data";
  if (counted < MIN_POSTS) return "too_few_posts";
  if (share - target < -TOLERANCE) return "under";
  if (share - target > TOLERANCE) return "over";
  return "on_target";
}

function actualOf(pillar: PillarSpec, counted: readonly PostRecord[]): PillarActual {
  const topics = new Set(pillar.topics.map(normaliseTopic));
  const matching = counted.filter((p) => p.topics.some((t) => topics.has(t)));
  const share = counted.length === 0 ? null : matching.length / counted.length;
  return {
    pillarId: pillar.id,
    posts: matching.length,
    actualShare: share,
    gap: share === null ? null : share - pillar.targetShare,
    status: statusOf(share, pillar.targetShare, counted.length),
    performance: summarisePosts(pillar.id, matching),
  };
}

// Only fully listed posts on archive-covered days count: elsewhere a missing post may be one
// the import never saw, and top-post exports would over-weight whatever did well (ADR 0023).
export function pillarReport(
  pillars: readonly PillarSpec[],
  posts: readonly PostRecord[],
  window: DayWindow,
): PillarReport {
  const measured = measuredPart(posts, window);
  const counted = measured ? countedPosts(posts, measured) : [];
  const assigned = new Set(pillars.flatMap((p) => p.topics.map(normaliseTopic)));
  const unassigned = counted.filter((p) => !p.topics.some((t) => assigned.has(t))).length;
  return {
    window,
    measured,
    measuredDays: measured ? daysBetween(measured.from, measured.to) + 1 : 0,
    totalDays: daysBetween(window.from, window.to) + 1,
    posts: counted.length,
    unassigned: { posts: unassigned, share: counted.length ? unassigned / counted.length : null },
    pillars: pillars.map((p) => actualOf(p, counted)),
  };
}
