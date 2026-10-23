import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { csrf } from "hono/csrf";
import { secureHeaders } from "hono/secure-headers";
import type { AuthService } from "../application/auth/auth-service";
import type { JobRepository } from "../application/jobs/ports";
import { type AppEnv, errorResponse } from "./http";
import { SESSION_COOKIE, authRoutes } from "./routes/auth";
import { jobRoutes } from "./routes/jobs";

export interface AppDeps {
  auth: AuthService;
  jobs: JobRepository;
  secureCookies: boolean;
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
  return api;
}
