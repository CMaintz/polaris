import { Hono } from "hono";
import { z } from "zod";
import type { CampaignService } from "../../application/strategy/campaign-service";
import type { PillarService } from "../../application/strategy/pillar-service";
import type { StrategyAnalysis } from "../../application/strategy/strategy-analysis";
import { type AppEnv, currentUser, readJson, readPatch, readQuery, requireUser } from "../http";

export interface StrategyRouteDeps {
  campaigns: CampaignService;
  pillars: PillarService;
  analysis: StrategyAnalysis;
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const text = (max: number) => z.string().max(max);
const ids = z.array(z.string().min(1).max(100)).max(200);

const campaignSchema = z.object({
  name: text(200).min(1),
  objective: text(2000).default(""),
  startDate: day,
  endDate: day,
  status: z.enum(["planned", "active", "done", "cancelled"]).default("planned"),
  notes: text(5000).default(""),
});

const linksSchema = z.object({ postIds: ids, planItemIds: ids, goalIds: ids });

const topic = z.string().regex(/^#?[\p{L}\p{N}_]{1,100}$/u, "expected a hashtag topic");

const pillarSchema = z.object({
  name: text(200).min(1),
  description: text(2000).default(""),
  topics: z.array(topic).min(1).max(30),
  targetShare: z.number().min(0).max(1),
});

// `days` counts back from `to` (default: the latest imported day) when `from` is not given.
const rangeQuery = z.object({
  from: day.optional(),
  to: day.optional(),
  days: z.coerce.number().int().min(7).max(1095).optional(),
});
const funnelQuery = rangeQuery.extend({ granularity: z.enum(["week", "month"]).default("week") });

function campaignRoutes({ campaigns, analysis }: StrategyRouteDeps) {
  return new Hono<AppEnv>()
    .get("/", async (c) => c.json({ items: await campaigns.list(currentUser(c).id) }))
    .post("/", async (c) => {
      const values = await readJson(c, campaignSchema);
      return c.json({ item: await campaigns.create(currentUser(c).id, values) }, 201);
    })
    .get("/:id", async (c) =>
      c.json({ item: await campaigns.get(currentUser(c).id, c.req.param("id")) }),
    )
    .patch("/:id", async (c) => {
      const patch = await readPatch(c, campaignSchema);
      return c.json({ item: await campaigns.update(currentUser(c).id, c.req.param("id"), patch) });
    })
    .delete("/:id", async (c) => {
      await campaigns.remove(currentUser(c).id, c.req.param("id"));
      return c.body(null, 204);
    })
    .put("/:id/links", async (c) => {
      const links = await readJson(c, linksSchema);
      return c.json({
        item: await campaigns.setLinks(currentUser(c).id, c.req.param("id"), links),
      });
    })
    .get("/:id/performance", async (c) =>
      c.json(await analysis.campaignPerformance(currentUser(c).id, c.req.param("id"))),
    )
    .get("/:id/funnel", async (c) =>
      c.json(await analysis.campaignFunnel(currentUser(c).id, c.req.param("id"))),
    );
}

function pillarRoutes({ pillars, analysis }: StrategyRouteDeps) {
  return new Hono<AppEnv>()
    .get("/", async (c) => c.json({ items: await pillars.list(currentUser(c).id) }))
    .get("/report", async (c) =>
      c.json(await analysis.pillarReport(currentUser(c).id, readQuery(c, rangeQuery))),
    )
    .post("/", async (c) => {
      const values = await readJson(c, pillarSchema);
      return c.json({ item: await pillars.create(currentUser(c).id, values) }, 201);
    })
    .patch("/:id", async (c) => {
      const patch = await readPatch(c, pillarSchema);
      return c.json({ item: await pillars.update(currentUser(c).id, c.req.param("id"), patch) });
    })
    .delete("/:id", async (c) => {
      await pillars.remove(currentUser(c).id, c.req.param("id"));
      return c.body(null, 204);
    });
}

export function strategyRoutes(deps: StrategyRouteDeps) {
  return new Hono<AppEnv>()
    .use(requireUser)
    .route("/campaigns", campaignRoutes(deps))
    .route("/pillars", pillarRoutes(deps))
    .get("/funnel", async (c) => {
      const { granularity, ...range } = readQuery(c, funnelQuery);
      return c.json(await deps.analysis.funnel(currentUser(c).id, granularity, range));
    });
}
