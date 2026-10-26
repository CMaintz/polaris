import { Hono } from "hono";
import { z } from "zod";
import type { AiService } from "../../application/ai/ai-service";
import type { CredentialService } from "../../application/ai/credentials";
import type { AiInsight, AiStore } from "../../application/ai/store";
import type { ContentStore } from "../../application/content/ports";
import type { InsightDto } from "../../../shared/api-types";
import { type AppEnv, currentUser, readJson, readQuery, requireUser } from "../http";
import { toJobDto } from "./jobs";

const provider = z.enum(["anthropic", "openai"]);
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

export function aiRoutes(
  ai: AiService,
  credentials: CredentialService,
  store: AiStore,
  content: ContentStore,
) {
  const accountId = async (userId: string) => (await content.findAccount(userId))?.id ?? null;
  return new Hono<AppEnv>()
    .use(requireUser)
    .get("/credentials", async (c) =>
      c.json({ credentials: await credentials.list(currentUser(c).id) }),
    )
    .put("/credentials/:provider", async (c) => {
      const id = provider.parse(c.req.param("provider"));
      const body = await readJson(
        c,
        z.object({ apiKey: z.string(), model: z.string().max(100).optional() }),
      );
      return c.json({
        credential: await credentials.save(currentUser(c).id, id, body.apiKey, body.model),
      });
    })
    .delete("/credentials/:provider", async (c) => {
      await credentials.remove(currentUser(c).id, provider.parse(c.req.param("provider")));
      return c.body(null, 204);
    })
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
    })
    .get("/insights", async (c) => {
      const filter = readQuery(
        c,
        z.object({ scope: z.enum(["account", "post"]).optional(), postId: z.string().optional() }),
      );
      const id = await accountId(currentUser(c).id);
      return c.json({ insights: id ? (await store.insights(id, filter)).map(toAiInsightDto) : [] });
    })
    .get("/recommendations", async (c) => {
      const id = await accountId(currentUser(c).id);
      return c.json({ recommendations: id ? await store.recommendations(id) : [] });
    })
    .patch("/recommendations/:id", async (c) => {
      const { status } = await readJson(
        c,
        z.object({ status: z.enum(["open", "accepted", "dismissed", "done"]) }),
      );
      await ai.setRecommendationStatus(currentUser(c).id, c.req.param("id"), status);
      return c.body(null, 204);
    })
    .get("/interactions", async (c) => {
      const list = await store.interactions(currentUser(c).id, 50);
      return c.json({
        interactions: list.map(({ output: _output, userId: _user, ...rest }) => rest),
      });
    });
}
