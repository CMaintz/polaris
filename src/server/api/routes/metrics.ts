import { createHash, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { NotFoundError, UnauthorizedError } from "../../application/errors";
import type { AppEnv } from "../http";

interface MetricsSource {
  readonly contentType: string;
  render(): string;
}

export interface MetricsRouteDeps {
  /** Unset keeps the endpoint off: metrics reveal usage patterns of a single-user install. */
  token: string | undefined;
  source: MetricsSource;
}

const BEARER = "Bearer ";

// Hashing first gives both sides the same length, which timingSafeEqual requires, so the
// comparison leaks neither the token nor its length.
function sameSecret(given: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

function presentedToken(header: string | undefined): string | null {
  return header?.startsWith(BEARER) ? header.slice(BEARER.length) : null;
}

export function metricsRoutes(deps: MetricsRouteDeps) {
  return new Hono<AppEnv>().get("/", (c) => {
    if (!deps.token) throw new NotFoundError("Route");
    const given = presentedToken(c.req.header("authorization"));
    if (given === null || !sameSecret(given, deps.token)) throw new UnauthorizedError();
    return c.body(deps.source.render(), 200, { "content-type": deps.source.contentType });
  });
}
