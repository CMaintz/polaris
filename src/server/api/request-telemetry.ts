import type { Context, MiddlewareHandler } from "hono";
import { routePath } from "hono/route";
import { type Labels, type Telemetry, startTimer } from "../application/telemetry/ports";

const METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

/**
 * The pattern of the last route Hono matched. When only middleware matched (an unknown
 * path), that pattern is a wildcard, and the raw path must not stand in for it.
 */
function routeOf(c: Context): string {
  const pattern = routePath(c, -1);
  return pattern.endsWith("*") ? "unmatched" : pattern;
}

function labelsOf(c: Context): Labels {
  return {
    method: METHODS.has(c.req.method) ? c.req.method : "other",
    route: routeOf(c),
    status: `${Math.floor(c.res.status / 100)}xx`,
  };
}

/** Register before any other middleware so rejected requests (401, 403) are counted too. */
export function requestTelemetry(telemetry: Telemetry): MiddlewareHandler {
  return async (c, next) => {
    const elapsed = startTimer();
    await next();
    const seconds = elapsed();
    const labels = labelsOf(c);
    telemetry.count("http_requests_total", labels);
    telemetry.observe("http_request_duration_seconds", labels, seconds);
    if (c.res.status >= 500) telemetry.log("request_failed", labels, seconds);
  };
}
