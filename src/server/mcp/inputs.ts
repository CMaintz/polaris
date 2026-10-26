import { z } from "zod";
import {
  BANDS,
  BREAKDOWN_DIMENSIONS,
  CONTENT_TYPES,
  DIRECTIONS,
  GRANULARITIES,
  LIMITS,
  POST_SORTS,
  SERIES_METRICS,
  day,
} from "../application/analytics/query-options";
import { PERIOD_DAYS } from "../domain/dates";

// Tool arguments arrive as JSON, so unlike the HTTP query schemas nothing is coerced.

const int = (limits: { min: number; max: number }) =>
  z.number().int().min(limits.min).max(limits.max);

const tzOffsetMinutes = int(LIMITS.tzOffset)
  .default(0)
  .describe("UTC offset in minutes, east positive, for weekday and hour buckets. Default UTC.");

const from = day.optional().describe("First day to include, YYYY-MM-DD.");
const to = day.optional().describe("Last day to include, YYYY-MM-DD.");

export const dashboardInput = {
  days: int(LIMITS.periodDays)
    .default(PERIOD_DAYS)
    .describe("KPI period length in days, ending at the latest imported day."),
  tzOffsetMinutes,
};

export const listPostsInput = {
  from: from.describe("Only posts published on or after this day, YYYY-MM-DD."),
  to: to.describe("Only posts published on or before this day, YYYY-MM-DD."),
  sort: z.enum(POST_SORTS).default("published"),
  dir: z.enum(DIRECTIONS).default("desc"),
  limit: int(LIMITS.posts).default(LIMITS.posts.default),
  offset: z.number().int().min(0).default(0),
  q: z
    .string()
    .max(LIMITS.searchText)
    .optional()
    .describe("Case-insensitive text the post must contain."),
  type: z.enum(CONTENT_TYPES).optional(),
  topic: z.string().max(LIMITS.topic).optional().describe("A hashtag topic, without the #."),
  band: z.enum(BANDS).optional().describe("Performance band relative to the account's posts."),
};

export const getPostInput = {
  id: z.string().min(1).describe("A post id from list_posts or dashboard."),
};

export const timeseriesInput = {
  metric: z.enum(SERIES_METRICS),
  interval: z.enum(GRANULARITIES).default("day"),
  from,
  to: to.describe("Last day to include, YYYY-MM-DD. Defaults to the latest imported day."),
  days: int(LIMITS.seriesDays).optional().describe("Days back from `to`, used when no `from`."),
  rolling: int(LIMITS.rolling).default(0).describe("Rolling average window in points; 0 is off."),
};

export const breakdownsInput = {
  dimension: z
    .enum(BREAKDOWN_DIMENSIONS)
    .describe("Weekday keys run 0 (Monday) to 6; hour keys 0 to 23 in the given offset."),
  tzOffsetMinutes,
};

export const ruleInsightsInput = { tzOffsetMinutes };
