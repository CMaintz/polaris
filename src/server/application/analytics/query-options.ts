import { z } from "zod";

// The choices the analytics reads accept, shared by the HTTP routes and the MCP tools so the
// two adapters cannot drift apart on a sort key or a metric name.

export const POST_SORTS = [
  "published",
  "impressions",
  "engagements",
  "engagement_rate",
  "reactions",
  "comments",
  "reposts",
] as const;

export const CONTENT_TYPES = [
  "text",
  "image",
  "video",
  "document",
  "article",
  "link",
  "unknown",
] as const;

export const BANDS = ["top", "middle", "bottom", "unrated"] as const;

export const SERIES_METRICS = [
  "impressions",
  "engagements",
  "followers",
  "new_followers",
  "posts",
] as const;

export const GRANULARITIES = ["day", "week", "month"] as const;

export const DIRECTIONS = ["asc", "desc"] as const;

export const BREAKDOWN_DIMENSIONS = ["content_type", "topic", "weekday", "hour"] as const;

export const LIMITS = {
  periodDays: { min: 7, max: 365 },
  seriesDays: { min: 7, max: 1095 },
  rolling: { min: 0, max: 90 },
  posts: { min: 1, max: 100, default: 25 },
  searchText: 200,
  topic: 100,
  // A UTC offset in minutes, east positive; the extremes are UTC-14 and UTC+14.
  tzOffset: { min: -840, max: 840 },
} as const;

export const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
