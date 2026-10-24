import { Hono } from "hono";
import { z } from "zod";
import type { ConnectionService } from "../../application/action/connections";
import type { DraftingService } from "../../application/action/drafting";
import type { DraftService, DraftView } from "../../application/action/drafts";
import type { PlanningAgent } from "../../application/action/planning-agent";
import type { DraftVersion, Proposal, Publication } from "../../application/action/ports";
import type { ProposalService } from "../../application/action/proposals";
import type { PublishingService } from "../../application/action/publishing";
import { AppError } from "../../application/errors";
import type {
  DraftDto,
  DraftVersionDto,
  ProposalDto,
  PublicationDto,
} from "../../../shared/action-types";
import { type AppEnv, currentUser, readJson, readQuery, requireUser } from "../http";
import { toJobDto } from "./jobs";

export interface ActionRouteDeps {
  drafts: DraftService;
  drafting: DraftingService;
  proposals: ProposalService;
  planner: PlanningAgent;
  publishing: PublishingService;
  connections: ConnectionService;
}

const title = z.string().trim().min(1).max(200);
const text = z.string().max(20000);
const brief = z.string().max(500).default("");
const tz = z.number().int().min(-840).max(840).default(0);
const instant = z.iso.datetime({ offset: true }).transform((t) => new Date(t).toISOString());

const toDraftDto = (d: DraftView): DraftDto => ({ ...d });
const toVersionDto = ({ interactionId: _i, ...v }: DraftVersion): DraftVersionDto => v;
const toPublicationDto = ({ createdAt: _c, ...p }: Publication): PublicationDto => p;
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

function draftRoutes({ drafts, drafting, publishing }: ActionRouteDeps) {
  const create = z.object({
    title,
    text: text.default(""),
    planItemId: z.string().nullable().default(null),
  });
  const patch = z.object({ title: title.optional(), planItemId: z.string().nullable().optional() });
  const ai = z.object({
    topic: z.string().max(500),
    angle: brief,
    tone: brief,
    draftId: z.string().nullable().default(null),
    planItemId: z.string().nullable().default(null),
  });
  return new Hono<AppEnv>()
    .get("/", async (c) =>
      c.json({ drafts: (await drafts.list(currentUser(c).id)).map(toDraftDto) }),
    )
    .post("/", async (c) => {
      const draft = await drafts.create(currentUser(c).id, await readJson(c, create));
      return c.json({ draft: toDraftDto(draft) }, 201);
    })
    .post("/ai", async (c) => {
      const job = await drafting.start(currentUser(c).id, await readJson(c, ai));
      return c.json({ job: toJobDto(job) }, 202);
    })
    .get("/:id", async (c) => {
      const detail = await drafts.detail(currentUser(c).id, c.req.param("id"));
      return c.json({
        draft: toDraftDto(detail.draft),
        versions: detail.versions.map(toVersionDto),
        publications: detail.publications.map(toPublicationDto),
      });
    })
    .patch("/:id", async (c) => {
      const draft = await drafts.update(
        currentUser(c).id,
        c.req.param("id"),
        await readJson(c, patch),
      );
      return c.json({ draft: toDraftDto(draft) });
    })
    .delete("/:id", async (c) => {
      await drafts.remove(currentUser(c).id, c.req.param("id"));
      return c.body(null, 204);
    })
    .post("/:id/versions", async (c) => {
      const body = await readJson(c, z.object({ text }));
      return c.json(
        { draft: toDraftDto(await drafts.save(currentUser(c).id, c.req.param("id"), body.text)) },
        201,
      );
    })
    .post("/:id/restore", async (c) => {
      const { version } = await readJson(c, z.object({ version: z.number().int().positive() }));
      return c.json(
        { draft: toDraftDto(await drafts.restore(currentUser(c).id, c.req.param("id"), version)) },
        201,
      );
    })
    .post("/:id/approve", async (c) =>
      c.json({ draft: toDraftDto(await drafts.approve(currentUser(c).id, c.req.param("id"))) }),
    )
    .post("/:id/schedule", async (c) => {
      const body = await readJson(c, z.object({ provider: z.string().max(50), at: instant }));
      const publication = await publishing.schedule(currentUser(c).id, c.req.param("id"), body);
      return c.json({ publication: toPublicationDto(publication) }, 201);
    });
}

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
