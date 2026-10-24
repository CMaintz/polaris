import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { csrf } from "hono/csrf";
import { secureHeaders } from "hono/secure-headers";
import type { AuthService } from "../application/auth/auth-service";
import type { JobRepository } from "../application/jobs/ports";
import type { ImportService } from "../application/imports/import-service";
import { importRoutes } from "./routes/imports";
import { analyticsRoutes } from "./routes/analytics";
import { aiRoutes } from "./routes/ai";
import { accountRoutes } from "./routes/account";
import { planningRoutes } from "./routes/planning";
import { type StrategyRouteDeps, strategyRoutes } from "./routes/strategy";
import { type KnowledgeRouteDeps, knowledgeRoutes } from "./routes/knowledge";
import type { ResolveAccount } from "../application/content/ports";
import type { AccountService } from "../application/account/account-service";
import type { PlanningService } from "../application/planning/planning-service";
import type { AiService } from "../application/ai/ai-service";
import type { CredentialService } from "../application/ai/credentials";
import type { AnalyticsService } from "../application/analytics/analytics-service";
import { type AppEnv, errorResponse } from "./http";
import { SESSION_COOKIE, authRoutes } from "./routes/auth";
import { jobRoutes } from "./routes/jobs";

export interface AppDeps {
  auth: AuthService;
  jobs: JobRepository;
  imports: ImportService;
  analytics: AnalyticsService;
  ai: AiService;
  credentials: CredentialService;
  planning: PlanningService;
  account: AccountService;
  strategy: StrategyRouteDeps;
  knowledge: Omit<KnowledgeRouteDeps, "resolveAccount">;
  resolveAccount: ResolveAccount;
  secureCookies: boolean;
  maxUploadBytes: number;
}

export function createApi(deps: AppDeps) {
  const api = new Hono<AppEnv>();
  api.onError((error, c) => errorResponse(c, error));
  api.use(secureHeaders());
  // Rejects cross-origin form and multipart posts (the content types a browser sends
  // without a CORS preflight). JSON requests already require a preflight.
  api.use(csrf());
  api.use(async (c, next) => {
    c.set("user", await deps.auth.authenticate(getCookie(c, SESSION_COOKIE)));
    await next();
  });
  api.get("/health", (c) => c.json({ status: "ok" }));
  api.route("/auth", authRoutes(deps.auth, deps.secureCookies));
  api.route("/jobs", jobRoutes(deps.jobs));
  api.route("/imports", importRoutes(deps.imports, deps.maxUploadBytes));
  api.route("/ai", aiRoutes(deps.ai, deps.credentials));
  const planning = planningRoutes(deps.planning);
  api.route("/goals", planning.goals);
  api.route("/experiments", planning.experiments);
  api.route("/plan", planning.plan);
  api.route("/me", accountRoutes(deps.account));
  api.route("/strategy", strategyRoutes(deps.strategy));
  api.route(
    "/knowledge",
    knowledgeRoutes({ ...deps.knowledge, resolveAccount: deps.resolveAccount }),
  );
  api.route("/", analyticsRoutes(deps.analytics));
  return api;
}
