import { type Context, Hono } from "hono";
import { z } from "zod";
import { ConflictError } from "../../application/errors";
import type { FeedService } from "../../application/intelligence/feed-service";
import type { PeerService } from "../../application/intelligence/peer-service";
import type { ResolveAccount } from "../../application/intelligence/ports";
import type { ResearchService } from "../../application/intelligence/research-service";
import type { ScheduleService } from "../../application/intelligence/schedule-service";
import type { TrendService } from "../../application/intelligence/trend-service";
import { CADENCES, SCHEDULE_KINDS } from "../../../shared/intelligence-types";
import { type AppEnv, currentUser, readJson, requireUser } from "../http";

export interface IntelligenceDeps {
  resolveAccount: ResolveAccount;
  research: ResearchService;
  peers: PeerService;
  feeds: FeedService;
  trends: TrendService;
  schedules: ScheduleService;
}

const peerSchema = z.object({
  name: z.string().min(1).max(200),
  profileUrl: z.string().max(2000).nullable().default(null),
  notes: z.string().max(5000).default(""),
});

const researchSchema = z.object({
  question: z.string().min(1).max(500),
  peerId: z.string().nullable().default(null),
});

const scheduleSchema = z.object({
  kind: z.enum(SCHEDULE_KINDS),
  cadence: z.enum(CADENCES),
  params: z
    .object({
      tz: z.number().int().min(-840).max(840).optional(),
      withAi: z.boolean().optional(),
      question: z.string().max(500).optional(),
      peerId: z.string().nullable().optional(),
    })
    .default({}),
});

const schedulePatch = z.object({
  cadence: z.enum(CADENCES).optional(),
  enabled: z.boolean().optional(),
});

type Ctx = Context<AppEnv>;

async function requireAccount(c: Ctx, resolve: ResolveAccount): Promise<string> {
  const accountId = await resolve(currentUser(c).id);
  if (!accountId) throw new ConflictError("Import your LinkedIn data or load the demo data first");
  return accountId;
}

/** Reads before an account exists answer with an empty list rather than an error. */
async function listFor<T>(
  c: Ctx,
  resolve: ResolveAccount,
  read: (accountId: string) => Promise<T[]>,
) {
  const accountId = await resolve(currentUser(c).id);
  return c.json({ items: accountId ? await read(accountId) : [] });
}

function peerRoutes({ resolveAccount, peers }: IntelligenceDeps) {
  return new Hono<AppEnv>()
    .get("/", (c) => listFor(c, resolveAccount, (a) => peers.list(a)))
    .post("/", async (c) => {
      const input = await readJson(c, peerSchema);
      return c.json(
        { item: await peers.create(await requireAccount(c, resolveAccount), input) },
        201,
      );
    })
    .put("/:id", async (c) => {
      const input = await readJson(c, peerSchema);
      const accountId = await requireAccount(c, resolveAccount);
      return c.json({ item: await peers.replace(accountId, c.req.param("id"), input) });
    })
    .delete("/:id", async (c) => {
      await peers.remove(await requireAccount(c, resolveAccount), c.req.param("id"));
      return c.body(null, 204);
    });
}

function researchRoutes({ resolveAccount, research }: IntelligenceDeps) {
  return new Hono<AppEnv>()
    .get("/", (c) => listFor(c, resolveAccount, (a) => research.list(a)))
    .post("/", async (c) => {
      const input = await readJson(c, researchSchema);
      const accountId = await requireAccount(c, resolveAccount);
      return c.json({ job: await research.start(currentUser(c).id, accountId, input) }, 202);
    });
}

function feedRoutes({ resolveAccount, feeds }: IntelligenceDeps) {
  return new Hono<AppEnv>()
    .get("/", (c) => listFor(c, resolveAccount, (a) => feeds.list(a)))
    .post("/", async (c) => {
      const { url } = await readJson(c, z.object({ url: z.string().min(1).max(2000) }));
      const accountId = await requireAccount(c, resolveAccount);
      return c.json(await feeds.add(currentUser(c).id, accountId, url), 201);
    })
    .post("/refresh", async (c) => {
      const accountId = await requireAccount(c, resolveAccount);
      return c.json({ job: await feeds.refresh(currentUser(c).id, accountId) }, 202);
    })
    .delete("/:id", async (c) => {
      await feeds.remove(await requireAccount(c, resolveAccount), c.req.param("id"));
      return c.body(null, 204);
    });
}

function trendRoutes({ resolveAccount, trends }: IntelligenceDeps) {
  return new Hono<AppEnv>()
    .get("/", async (c) => {
      const accountId = await resolveAccount(currentUser(c).id);
      const empty = { trackedSince: null, topics: [], recent: [] };
      return c.json(accountId ? await trends.trends(accountId) : empty);
    })
    .get("/digests", (c) => listFor(c, resolveAccount, (a) => trends.digests(a)))
    .post("/digests", async (c) => {
      const { withAi } = await readJson(c, z.object({ withAi: z.boolean().default(true) }));
      const accountId = await requireAccount(c, resolveAccount);
      return c.json({ job: await trends.startDigest(currentUser(c).id, accountId, withAi) }, 202);
    });
}

function scheduleRoutes({ resolveAccount, schedules }: IntelligenceDeps) {
  return new Hono<AppEnv>()
    .get("/", (c) => listFor(c, resolveAccount, (a) => schedules.list(a)))
    .post("/", async (c) => {
      const input = await readJson(c, scheduleSchema);
      const accountId = await requireAccount(c, resolveAccount);
      return c.json({ item: await schedules.create(accountId, input) }, 201);
    })
    .patch("/:id", async (c) => {
      const patch = await readJson(c, schedulePatch);
      const accountId = await requireAccount(c, resolveAccount);
      return c.json({ item: await schedules.update(accountId, c.req.param("id"), patch) });
    })
    .delete("/:id", async (c) => {
      await schedules.remove(await requireAccount(c, resolveAccount), c.req.param("id"));
      return c.body(null, 204);
    });
}

export function intelligenceRoutes(deps: IntelligenceDeps) {
  return new Hono<AppEnv>()
    .use(requireUser)
    .route("/peers", peerRoutes(deps))
    .route("/research", researchRoutes(deps))
    .route("/feeds", feedRoutes(deps))
    .route("/trends", trendRoutes(deps))
    .route("/schedules", scheduleRoutes(deps));
}
