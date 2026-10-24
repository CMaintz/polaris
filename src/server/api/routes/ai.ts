import { Hono } from "hono";
import { z } from "zod";
import type { AiService } from "../../application/ai/ai-service";
import type { CredentialService } from "../../application/ai/credentials";
import { AI_PROVIDERS } from "../../application/ai/ports";
import type { AiInsight } from "../../application/ai/store";
import type { InsightDto } from "../../../shared/ai-types";
import { type AppEnv, currentUser, readJson, readQuery, requireUser } from "../http";
import { toJobDto } from "./jobs";

const provider = z.enum(AI_PROVIDERS);
const tz = z.number().int().min(-840).max(840).default(0);

function toAiInsightDto(insight: AiInsight): InsightDto {
  return {
    id: insight.id,
    origin: "ai",
    key: insight.scope,
    title: insight.title,
    observation: insight.observation,
    interpretation: insight.interpretation,
    action: insight.action,
    signal: insight.signal,
    confidence: insight.confidence,
    evidence: insight.evidence,
    createdAt: insight.createdAt,
    basedOnDemoData: insight.basedOnDemo,
  };
}

function credentialRoutes(credentials: CredentialService) {
  const save = z.object({ apiKey: z.string(), model: z.string().max(100).optional() });
  return new Hono<AppEnv>()
    .get("/", async (c) => c.json({ credentials: await credentials.list(currentUser(c).id) }))
    .put("/:provider", async (c) => {
      const id = provider.parse(c.req.param("provider"));
      const body = await readJson(c, save);
      return c.json({
        credential: await credentials.save(currentUser(c).id, id, body.apiKey, body.model),
      });
    })
    .delete("/:provider", async (c) => {
      await credentials.remove(currentUser(c).id, provider.parse(c.req.param("provider")));
      return c.body(null, 204);
    });
}

function jobRoutes(ai: AiService) {
  return new Hono<AppEnv>()
    .post("/reviews/account", async (c) => {
      const body = await readJson(c, z.object({ tz }));
      return c.json(
        { job: toJobDto(await ai.startAccountReview(currentUser(c).id, body.tz)) },
        202,
      );
    })
    .post("/reviews/posts/:id", async (c) => {
      const body = await readJson(c, z.object({ tz }));
      const job = await ai.startPostReview(currentUser(c).id, c.req.param("id"), body.tz);
      return c.json({ job: toJobDto(job) }, 202);
    })
    .post("/questions", async (c) => {
      const body = await readJson(c, z.object({ question: z.string(), tz }));
      return c.json(
        { job: toJobDto(await ai.ask(currentUser(c).id, body.question, body.tz)) },
        202,
      );
    });
}

function outputRoutes(ai: AiService) {
  const filter = z.object({
    scope: z.enum(["account", "post"]).optional(),
    postId: z.string().optional(),
  });
  const status = z.object({ status: z.enum(["open", "accepted", "dismissed", "done"]) });
  return new Hono<AppEnv>()
    .get("/insights", async (c) => {
      const insights = await ai.insights(currentUser(c).id, readQuery(c, filter));
      return c.json({ insights: insights.map(toAiInsightDto) });
    })
    .get("/recommendations", async (c) => {
      return c.json({ recommendations: await ai.recommendations(currentUser(c).id) });
    })
    .patch("/recommendations/:id", async (c) => {
      const body = await readJson(c, status);
      await ai.setRecommendationStatus(currentUser(c).id, c.req.param("id"), body.status);
      return c.body(null, 204);
    })
    .get("/interactions", async (c) => {
      return c.json({ interactions: await ai.interactions(currentUser(c).id) });
    });
}

export function aiRoutes(ai: AiService, credentials: CredentialService) {
  return new Hono<AppEnv>()
    .use(requireUser)
    .route("/credentials", credentialRoutes(credentials))
    .route("/", jobRoutes(ai))
    .route("/", outputRoutes(ai));
}
