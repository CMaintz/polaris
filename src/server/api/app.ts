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
import { accountsRoutes } from "./routes/accounts";
import { planningRoutes } from "./routes/planning";
import { type StrategyRouteDeps, strategyRoutes } from "./routes/strategy";
import { type KnowledgeRouteDeps, knowledgeRoutes } from "./routes/knowledge";
import { type ActionRouteDeps, actionRoutes } from "./routes/action";
import { type IntelligenceDeps, intelligenceRoutes } from "./routes/intelligence";
import type { ResolveAccount } from "../application/content/ports";
import type { AccountService } from "../application/account/account-service";
import type { AccountsService } from "../application/accounts/accounts-service";
import type { PlanningService } from "../application/planning/planning-service";
import type { UnifiedPlan } from "../application/planning/unified-plan";
import type { AiService } from "../application/ai/ai-service";
import type { CredentialService } from "../application/ai/credentials";
import type { AnalyticsService } from "../application/analytics/analytics-service";
import type { ComparisonService } from "../application/analytics/comparison-service";
import { type AppEnv, errorResponse } from "./http";
import { SESSION_COOKIE, authRoutes } from "./routes/auth";
import { jobRoutes } from "./routes/jobs";
import { type MetricsRouteDeps, metricsRoutes } from "./routes/metrics";
import { requestTelemetry } from "./request-telemetry";
import type { Telemetry } from "../application/telemetry/ports";

export interface AppDeps {
  auth: AuthService;
  jobs: JobRepository;
  imports: ImportService;
  analytics: AnalyticsService;
  comparison: ComparisonService;
  ai: AiService;
  credentials: CredentialService;
  planning: PlanningService;
  unifiedPlan: UnifiedPlan;
  account: AccountService;
  accounts: AccountsService;
  strategy: StrategyRouteDeps;
  knowledge: Omit<KnowledgeRouteDeps, "resolveAccount">;
  resolveAccount: ResolveAccount;
  intelligence: { routes: IntelligenceDeps };
  action: ActionRouteDeps;
  secureCookies: boolean;
  maxUploadBytes: number;
  telemetry: Telemetry;
  metrics: MetricsRouteDeps;
}

export function createApi(deps: AppDeps) {
  const api = new Hono<AppEnv>();
  api.onError((error, c) => errorResponse(c, error));
  api.use(requestTelemetry(deps.telemetry));
  api.use(secureHeaders());
  // Rejects cross-origin form and multipart posts (the content types a browser sends
  // without a CORS preflight). JSON requests already require a preflight.
  api.use(csrf());
  api.use(async (c, next) => {
    c.set("user", await deps.auth.authenticate(getCookie(c, SESSION_COOKIE)));
    await next();
  });
  api.get("/health", (c) => c.json({ status: "ok" }));
  api.route("/metrics", metricsRoutes(deps.metrics));
  api.route("/auth", authRoutes(deps.auth, deps.secureCookies));
  api.route("/jobs", jobRoutes(deps.jobs));
  api.route("/imports", importRoutes(deps.imports, deps.maxUploadBytes));
  api.route("/ai", aiRoutes(deps.ai, deps.credentials));
  const planning = planningRoutes(deps.planning, deps.unifiedPlan);
  api.route("/goals", planning.goals);
  api.route("/experiments", planning.experiments);
  api.route("/plan", planning.plan);
  api.route("/me", accountRoutes(deps.account));
  api.route("/accounts", accountsRoutes(deps.accounts));
  api.route("/strategy", strategyRoutes(deps.strategy));
  api.route("/intelligence", intelligenceRoutes(deps.intelligence.routes));
  api.route("/action", actionRoutes(deps.action));
  api.route(
    "/knowledge",
    knowledgeRoutes({ ...deps.knowledge, resolveAccount: deps.resolveAccount }),
  );
  api.route("/", analyticsRoutes(deps.analytics, deps.comparison));
  return api;
}
