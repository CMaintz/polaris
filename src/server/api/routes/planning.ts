import { Hono } from "hono";
import { z } from "zod";
import type { PlanningService } from "../../application/planning/planning-service";
import type { UnifiedPlan } from "../../application/planning/unified-plan";
import { type AppEnv, currentUser, day, readJson, readPatch, requireUser } from "../http";

const text = (max: number) => z.string().max(max);

const goalSchema = z.object({
  name: text(200).min(1),
  metric: z.enum(["followers", "impressions", "engagements", "posts", "engagement_rate"]),
  target: z.number().positive(),
  startDate: day,
  endDate: day,
  status: z.enum(["active", "archived"]).default("active"),
  notes: text(5000).default(""),
});

const experimentSchema = z.object({
  goalId: z.string().nullable().default(null),
  name: text(200).min(1),
  hypothesis: text(2000).min(1),
  variable: text(500).default(""),
  metric: z.enum([
    "impressions",
    "engagements",
    "engagement_rate",
    "reactions",
    "comments",
    "reposts",
  ]),
  baseline: z.number().nullable().default(null),
  startDate: day,
  endDate: day,
  status: z.enum(["planned", "running", "completed", "abandoned"]).default("planned"),
  result: text(5000).default(""),
  conclusion: text(5000).default(""),
  followUp: text(5000).default(""),
});

const planSchema = z.object({
  title: text(200).min(1),
  concept: text(5000).default(""),
  targetTopic: text(100).default(""),
  plannedDate: day.nullable().default(null),
  status: z.enum(["idea", "drafting", "planned", "published", "dropped"]).default("idea"),
  draft: text(10000).default(""),
  postId: z.string().nullable().default(null),
});

const SCHEMAS = { goals: goalSchema, experiments: experimentSchema, plan: planSchema };

function crud<K extends keyof typeof SCHEMAS>(
  planning: PlanningService,
  kind: K,
  list: (userId: string) => Promise<unknown[]>,
) {
  const schema = SCHEMAS[kind];
  return new Hono<AppEnv>()
    .use(requireUser)
    .get("/", async (c) => c.json({ items: await list(currentUser(c).id) }))
    .post("/", async (c) => {
      const values = await readJson(c, schema as z.ZodType);
      return c.json({ item: await planning.create(currentUser(c).id, kind, values as never) }, 201);
    })
    .patch("/:id", async (c) => {
      const values = await readPatch(c, schema as unknown as z.ZodObject);
      const item = await planning.update(currentUser(c).id, kind, c.req.param("id"), values);
      return c.json({ item });
    })
    .delete("/:id", async (c) => {
      await planning.remove(currentUser(c).id, kind, c.req.param("id"));
      return c.body(null, 204);
    });
}

export function planningRoutes(planning: PlanningService, unified: UnifiedPlan) {
  return {
    goals: crud(planning, "goals", (userId) => planning.goals(userId)),
    experiments: crud(planning, "experiments", (userId) => planning.experiments(userId)),
    plan: crud(planning, "plan", (userId) => planning.planItems(userId)).get("/all", async (c) =>
      c.json({ items: await unified.items(currentUser(c).id) }),
    ),
  };
}
