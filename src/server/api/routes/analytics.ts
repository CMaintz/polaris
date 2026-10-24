import { Hono } from "hono";
import { z } from "zod";
import type { AnalyticsService } from "../../application/analytics/analytics-service";
import { PERIOD_DAYS } from "../../domain/dates";
import { type AppEnv, currentUser, day, readQuery, requireUser } from "../http";

// The browser's UTC offset in minutes (east positive), for posting-time buckets.
const tz = z.coerce.number().int().min(-840).max(840).default(0);

const dashboardQuery = z.object({
  days: z.coerce.number().int().min(7).max(365).default(PERIOD_DAYS),
  tz,
});

const postQuery = z.object({
  q: z.string().max(200).optional(),
  type: z.enum(["text", "image", "video", "document", "article", "link", "unknown"]).optional(),
  topic: z.string().max(100).optional(),
  band: z.enum(["top", "middle", "bottom", "unrated"]).optional(),
  from: day.optional(),
  to: day.optional(),
  sort: z
    .enum([
      "published",
      "impressions",
      "engagements",
      "engagement_rate",
      "reactions",
      "comments",
      "reposts",
    ])
    .default("published"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

const seriesQuery = z.object({
  metric: z.enum(["impressions", "engagements", "followers", "new_followers", "posts"]),
  granularity: z.enum(["day", "week", "month"]).default("day"),
  from: day.optional(),
  to: day.optional(),
  rolling: z.coerce.number().int().min(0).max(90).default(0),
  // Days back from the latest imported day, used when `from` is not given.
  days: z.coerce.number().int().min(7).max(1095).optional(),
});

// Mounted at the API root, so the session check is per route: a router-wide use() would
// also guard /health and /auth.
export function analyticsRoutes(analytics: AnalyticsService) {
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
