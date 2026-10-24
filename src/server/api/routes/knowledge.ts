import { type Context, Hono } from "hono";
import { z } from "zod";
import type { KnowledgeIndexer } from "../../application/knowledge/index-service";
import type { ResolveAccount } from "../../application/knowledge/ports";
import { type KnowledgeSearch, MAX_QUERY } from "../../application/knowledge/search-service";
import type { ThemeService } from "../../application/knowledge/theme-service";
import type { IndexStatusDto, SearchResponseDto, ThemesDto } from "../../../shared/knowledge-types";
import { type AppEnv, currentUser, readJson, readQuery, requireUser } from "../http";
import { toJobDto } from "./jobs";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

const searchQuery = z.object({
  q: z.string().trim().min(1).max(MAX_QUERY),
  mode: z.enum(["lexical", "semantic"]).default("lexical"),
  type: z.enum(["text", "image", "video", "document", "article", "link", "unknown"]).optional(),
  topic: z.string().max(100).optional(),
  theme: z.string().max(100).optional(),
  from: day.optional(),
  to: day.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// useStartJob sends the browser's timezone with every job; these jobs do not need it.
const jobBody = z.object({ tz: z.number().optional() });

export interface KnowledgeRouteDeps {
  search: Pick<KnowledgeSearch, "search">;
  indexer: Pick<KnowledgeIndexer, "start" | "status">;
  themes: Pick<ThemeService, "start" | "overview">;
  resolveAccount: ResolveAccount;
}

export function knowledgeRoutes(deps: KnowledgeRouteDeps) {
  const account = (c: Context<AppEnv>) => deps.resolveAccount(currentUser(c).id);
  return new Hono<AppEnv>()
    .use(requireUser)
    .get("/search", async (c) => {
      const { q, mode, type, limit, ...rest } = readQuery(c, searchQuery);
      const accountId = await account(c);
      const empty: SearchResponseDto = {
        requested: mode,
        used: "lexical",
        notice: null,
        results: [],
      };
      if (!accountId) return c.json(empty);
      const filters = { ...rest, contentType: type };
      return c.json(await deps.search.search(accountId, { q, mode, filters, limit }));
    })
    .get("/status", async (c) => {
      const status = await deps.indexer.status(currentUser(c).id, await account(c));
      const body: IndexStatusDto = {
        ...status,
        lastJob: status.lastJob && toJobDto(status.lastJob),
      };
      return c.json(body);
    })
    .post("/index", async (c) => {
      await readJson(c, jobBody);
      const job = await deps.indexer.start(currentUser(c).id, await account(c));
      return c.json({ job: toJobDto(job) }, 202);
    })
    .get("/themes", async (c) => {
      const overview = await deps.themes.overview(currentUser(c).id, await account(c));
      const body: ThemesDto = {
        ...overview,
        lastJob: overview.lastJob && toJobDto(overview.lastJob),
      };
      return c.json(body);
    })
    .post("/themes/run", async (c) => {
      await readJson(c, jobBody);
      const job = await deps.themes.start(currentUser(c).id, await account(c));
      return c.json({ job: toJobDto(job) }, 202);
    });
}
