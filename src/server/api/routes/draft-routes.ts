import { Hono } from "hono";
import { z } from "zod";
import type { DraftVersion } from "../../application/action/draft-ports";
import type { DraftingService } from "../../application/action/drafting";
import type { DraftService, DraftView } from "../../application/action/drafts";
import type { Publication } from "../../application/action/publication-ports";
import type { PublishingService } from "../../application/action/publishing";
import type { DraftDto, DraftVersionDto, PublicationDto } from "../../../shared/action-types";
import { type AppEnv, currentUser, readJson } from "../http";
import { toJobDto } from "./jobs";

export interface DraftRouteDeps {
  drafts: DraftService;
  drafting: DraftingService;
  publishing: PublishingService;
}

const title = z.string().trim().min(1).max(200);
const text = z.string().max(20000);
const brief = z.string().max(500).default("");
const instant = z.iso.datetime({ offset: true }).transform((t) => new Date(t).toISOString());

const toDraftDto = (d: DraftView): DraftDto => ({ ...d });
const toVersionDto = ({ interactionId: _i, ...v }: DraftVersion): DraftVersionDto => v;
const toPublicationDto = ({ createdAt: _c, ...p }: Publication): PublicationDto => p;

function recordRoutes(drafts: DraftService) {
  const create = z.object({
    title,
    text: text.default(""),
    planItemId: z.string().nullable().default(null),
  });
  const patch = z.object({ title: title.optional(), planItemId: z.string().nullable().optional() });
  return new Hono<AppEnv>()
    .get("/", async (c) =>
      c.json({ drafts: (await drafts.list(currentUser(c).id)).map(toDraftDto) }),
    )
    .post("/", async (c) => {
      const draft = await drafts.create(currentUser(c).id, await readJson(c, create));
      return c.json({ draft: toDraftDto(draft) }, 201);
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
      const body = await readJson(c, patch);
      const draft = await drafts.update(currentUser(c).id, c.req.param("id"), body);
      return c.json({ draft: toDraftDto(draft) });
    })
    .delete("/:id", async (c) => {
      await drafts.remove(currentUser(c).id, c.req.param("id"));
      return c.body(null, 204);
    });
}

function versionRoutes(drafts: DraftService) {
  const restore = z.object({ version: z.number().int().positive() });
  return new Hono<AppEnv>()
    .post("/:id/versions", async (c) => {
      const body = await readJson(c, z.object({ text }));
      const draft = await drafts.save(currentUser(c).id, c.req.param("id"), body.text);
      return c.json({ draft: toDraftDto(draft) }, 201);
    })
    .post("/:id/restore", async (c) => {
      const { version } = await readJson(c, restore);
      const draft = await drafts.restore(currentUser(c).id, c.req.param("id"), version);
      return c.json({ draft: toDraftDto(draft) }, 201);
    })
    .post("/:id/approve", async (c) =>
      c.json({ draft: toDraftDto(await drafts.approve(currentUser(c).id, c.req.param("id"))) }),
    );
}

function workflowRoutes({ drafting, publishing }: DraftRouteDeps) {
  const ai = z.object({
    topic: z.string().max(500),
    angle: brief,
    tone: brief,
    draftId: z.string().nullable().default(null),
    planItemId: z.string().nullable().default(null),
  });
  const schedule = z.object({ provider: z.string().max(50), at: instant });
  return new Hono<AppEnv>()
    .post("/ai", async (c) => {
      const job = await drafting.start(currentUser(c).id, await readJson(c, ai));
      return c.json({ job: toJobDto(job) }, 202);
    })
    .post("/:id/schedule", async (c) => {
      const body = await readJson(c, schedule);
      const publication = await publishing.schedule(currentUser(c).id, c.req.param("id"), body);
      return c.json({ publication: toPublicationDto(publication) }, 201);
    });
}

export function draftRoutes(deps: DraftRouteDeps) {
  return new Hono<AppEnv>()
    .route("/", recordRoutes(deps.drafts))
    .route("/", versionRoutes(deps.drafts))
    .route("/", workflowRoutes(deps));
}
