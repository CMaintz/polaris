import { Hono } from "hono";
import { z } from "zod";
import type { AnalyticsService } from "../../application/analytics/analytics-service";
import type { ComparisonService } from "../../application/analytics/comparison-service";
import {
  BANDS,
  CONTENT_TYPES,
  DIRECTIONS,
  GRANULARITIES,
  LIMITS,
  POST_SORTS,
  SERIES_METRICS,
  day,
} from "../../application/analytics/query-options";
import { PERIOD_DAYS } from "../../domain/dates";
import { type AppEnv, currentUser, readQuery, requireUser } from "../http";

// The browser's UTC offset, for posting-time buckets.
const tz = z.coerce.number().int().min(LIMITS.tzOffset.min).max(LIMITS.tzOffset.max).default(0);

const dashboardQuery = z.object({
  days: z.coerce
    .number()
    .int()
    .min(LIMITS.periodDays.min)
    .max(LIMITS.periodDays.max)
    .default(PERIOD_DAYS),
  tz,
});

const postQuery = z.object({
  q: z.string().max(LIMITS.searchText).optional(),
  type: z.enum(CONTENT_TYPES).optional(),
  topic: z.string().max(LIMITS.topic).optional(),
  band: z.enum(BANDS).optional(),
  from: day.optional(),
  to: day.optional(),
  sort: z.enum(POST_SORTS).default("published"),
  dir: z.enum(DIRECTIONS).default("desc"),
  limit: z.coerce
    .number()
    .int()
    .min(LIMITS.posts.min)
    .max(LIMITS.posts.max)
    .default(LIMITS.posts.default),
  offset: z.coerce.number().int().min(0).default(0),
});

const seriesQuery = z.object({
  metric: z.enum(SERIES_METRICS),
  granularity: z.enum(GRANULARITIES).default("day"),
  from: day.optional(),
  to: day.optional(),
  rolling: z.coerce.number().int().min(LIMITS.rolling.min).max(LIMITS.rolling.max).default(0),
  // Days back from the latest imported day, used when `from` is not given.
  days: z.coerce.number().int().min(LIMITS.seriesDays.min).max(LIMITS.seriesDays.max).optional(),
});

// Mounted at the API root, so the session check is per route: a router-wide use() would
// also guard /health and /auth.
export function analyticsRoutes(analytics: AnalyticsService, comparison: ComparisonService) {
  return new Hono<AppEnv>()
    .get("/dashboard", requireUser, async (c) => {
      const { days, tz: offset } = readQuery(c, dashboardQuery);
      return c.json(await analytics.dashboard(currentUser(c).id, days, offset));
    })
    .get("/posts", requireUser, async (c) =>
      c.json(await analytics.posts(currentUser(c).id, readQuery(c, postQuery))),
    )
    .get("/posts/:id", requireUser, async (c) =>
      c.json(await analytics.post(currentUser(c).id, c.req.param("id"))),
    )
    .get("/analytics/timeseries", requireUser, async (c) => {
      const q = readQuery(c, seriesQuery);
      const range = { from: q.from, to: q.to, days: q.days };
      return c.json(
        await analytics.timeseries(currentUser(c).id, q.metric, q.granularity, range, q.rolling),
      );
    })
    .get("/analytics/compare", requireUser, async (c) => {
      const { days } = readQuery(c, dashboardQuery);
      return c.json(await comparison.compare(currentUser(c).id, days));
    })
    .get("/analytics/breakdowns", requireUser, async (c) => {
      const { tz: offset } = readQuery(c, z.object({ tz }));
      return c.json(await analytics.breakdowns(currentUser(c).id, offset));
    })
    .get("/insights/rules", requireUser, async (c) => {
      const { tz: offset } = readQuery(c, z.object({ tz }));
      return c.json({ insights: await analytics.insights(currentUser(c).id, offset) });
    })
    .get("/audience", requireUser, async (c) =>
      c.json(await analytics.audience(currentUser(c).id)),
    );
}
