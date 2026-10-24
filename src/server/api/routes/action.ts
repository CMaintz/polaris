import { Hono } from "hono";
import { z } from "zod";
import type { ConnectionService } from "../../application/action/connections";
import type { PlanningAgent } from "../../application/action/planning-agent";
import type { Proposal } from "../../application/action/proposal-ports";
import type { ProposalService } from "../../application/action/proposals";
import { AppError } from "../../application/errors";
import type { ProposalDto } from "../../../shared/action-types";
import { type AppEnv, currentUser, readJson, readQuery, requireUser } from "../http";
import { type DraftRouteDeps, draftRoutes } from "./draft-routes";
import { toJobDto } from "./jobs";

export interface ActionRouteDeps extends DraftRouteDeps {
  proposals: ProposalService;
  planner: PlanningAgent;
  connections: ConnectionService;
}

const tz = z.number().int().min(-840).max(840).default(0);

const toProposalDto = (p: Proposal): ProposalDto => ({
  id: p.id,
  kind: p.kind,
  payload: p.payload as Record<string, unknown>,
  origin: p.origin,
  rationale: p.rationale,
  evidence: p.evidence,
  status: p.status,
  decidedAt: p.decidedAt,
  appliedRecordId: p.appliedRecordId,
  error: p.error,
  basedOnDemoData: p.basedOnDemo,
  createdAt: p.createdAt,
});

function publicationRoutes({ publishing }: ActionRouteDeps) {
  return new Hono<AppEnv>()
    .post("/:id/cancel", async (c) => {
      await publishing.cancel(currentUser(c).id, c.req.param("id"));
      return c.body(null, 204);
    })
    .post("/:id/confirm", async (c) => {
      const { url } = await readJson(
        c,
        z.object({ url: z.string().max(2000).nullable().default(null) }),
      );
      await publishing.confirm(currentUser(c).id, c.req.param("id"), url || null);
      return c.body(null, 204);
    });
}

function proposalRoutes({ proposals, planner }: ActionRouteDeps) {
  const status = z.enum(["pending", "approved", "rejected", "applied", "failed"]).optional();
  return new Hono<AppEnv>()
    .get("/", async (c) => {
      const query = readQuery(c, z.object({ status }));
      const list = await proposals.list(currentUser(c).id, query.status);
      return c.json({ proposals: list.map(toProposalDto) });
    })
    .post("/plan", async (c) => {
      const body = await readJson(c, z.object({ weeks: z.number().int(), tz }));
      return c.json(
        { job: toJobDto(await planner.start(currentUser(c).id, body.weeks, body.tz)) },
        202,
      );
    })
    .post("/:id/approve", async (c) =>
      c.json({
        proposal: toProposalDto(await proposals.approve(currentUser(c).id, c.req.param("id"))),
      }),
    )
    .post("/:id/reject", async (c) =>
      c.json({
        proposal: toProposalDto(await proposals.reject(currentUser(c).id, c.req.param("id"))),
      }),
    );
}

function connectionRoutes({ connections }: ActionRouteDeps) {
  return new Hono<AppEnv>()
    .get("/", async (c) => c.json({ connections: await connections.list(currentUser(c).id) }))
    .post("/:provider/connect", async (c) =>
      c.json({ url: await connections.start(currentUser(c).id, c.req.param("provider")) }),
    )
    .get("/:provider/callback", async (c) => {
      // A browser redirect from LinkedIn lands here, so answer with a page, not JSON.
      try {
        await connections.complete(currentUser(c).id, c.req.param("provider"), c.req.query());
        return c.redirect("/settings?publishing=connected");
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        return c.redirect(
          `/settings?publishing=error&message=${encodeURIComponent(error.message)}`,
        );
      }
    })
    .delete("/:provider", async (c) => {
      await connections.disconnect(currentUser(c).id, c.req.param("provider"));
      return c.body(null, 204);
    });
}

export function actionRoutes(deps: ActionRouteDeps) {
  return new Hono<AppEnv>()
    .use(requireUser)
    .route("/drafts", draftRoutes(deps))
    .route("/publications", publicationRoutes(deps))
    .route("/proposals", proposalRoutes(deps))
    .route("/connections", connectionRoutes(deps));
}
