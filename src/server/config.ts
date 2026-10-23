import { join } from "node:path";

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
  };
}
