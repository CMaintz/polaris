import { join } from "node:path";
import type { LinkedInAppConfig } from "./infrastructure/publishing/linkedin-oauth";

export interface Config {
  dbPath: string;
  dataDir: string;
  port: number;
  /** Bind address. Loopback by default; put a TLS reverse proxy in front for remote access. */
  host: string;
  secureCookies: boolean;
  allowSignup: boolean;
  /** Base64 32-byte key for encrypting stored AI keys; generated on first start when unset. */
  masterKey: string | undefined;
  webDistDir: string;
  /** Largest accepted import request, checked before the body is buffered. */
  maxUploadBytes: number;
  /** Plain http feed URLs; https only by default. Every fetch is SSRF-guarded either way. */
  feedsAllowHttp: boolean;
  /** The LinkedIn app for posting through the official API; null unless fully configured. */
  linkedin: LinkedInAppConfig | null;
  /** Bearer token for GET /api/metrics; the endpoint does not exist while this is unset. */
  metricsToken?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dbPath = env.POLARIS_DB_PATH ?? "./data/polaris.db";
  return {
    dbPath,
    dataDir: env.POLARIS_DATA_DIR ?? join(dbPath, ".."),
    port: Number(env.POLARIS_PORT ?? 4480),
    host: env.POLARIS_HOST ?? "127.0.0.1",
    secureCookies: env.POLARIS_SECURE_COOKIES === "true",
    allowSignup: env.POLARIS_ALLOW_SIGNUP === "true",
    masterKey: env.POLARIS_MASTER_KEY || undefined,
    webDistDir: env.POLARIS_WEB_DIST ?? "./dist/web",
    maxUploadBytes: Number(env.POLARIS_MAX_UPLOAD_MB ?? 100) * 1024 * 1024,
    feedsAllowHttp: env.POLARIS_FEEDS_ALLOW_HTTP === "true",
    linkedin: linkedInApp(env),
    metricsToken: env.POLARIS_METRICS_TOKEN || undefined,
  };
}

function linkedInApp(env: NodeJS.ProcessEnv): LinkedInAppConfig | null {
  const clientId = env.POLARIS_LINKEDIN_CLIENT_ID;
  const clientSecret = env.POLARIS_LINKEDIN_CLIENT_SECRET;
  const redirectUri = env.POLARIS_LINKEDIN_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return {
    clientId,
    clientSecret,
    redirectUri,
    apiVersion: env.POLARIS_LINKEDIN_API_VERSION ?? "202610",
    analytics: env.POLARIS_LINKEDIN_ANALYTICS === "true",
    refreshPostDays: Number(env.POLARIS_LINKEDIN_REFRESH_POST_DAYS ?? 30),
  };
}
