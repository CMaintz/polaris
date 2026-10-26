import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import type { User } from "../application/auth/ports";
import { AppError, UnauthorizedError, ValidationError } from "../application/errors";
import type { ApiErrorBody } from "../../shared/core-types";

export interface AppEnv {
  Variables: { user: User | null };
}

const STATUS_BY_CODE: Record<string, ContentfulStatusCode> = {
  validation: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  permanent: 422,
};

export function errorResponse(c: Context, error: unknown): Response {
  if (error instanceof AppError) {
    const body: ApiErrorBody = { error: { code: error.code, message: error.message } };
    return c.json(body, STATUS_BY_CODE[error.code] ?? 400);
  }
  if (error instanceof HTTPException) {
    const body: ApiErrorBody = { error: { code: "http", message: error.message } };
    return c.json(body, error.status);
  }
  // Unknown errors may carry internals (SQL, paths, provider responses); log, don't echo.
  console.error(error);
  const body: ApiErrorBody = { error: { code: "internal", message: "Something went wrong" } };
  return c.json(body, 500);
}

export async function readJson<T>(c: Context, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new ValidationError("Request body must be JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ValidationError(`${issue?.path.join(".") || "body"}: ${issue?.message}`);
  }
  return parsed.data;
}

export function readQuery<T>(c: Context, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(c.req.query());
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ValidationError(`${issue?.path.join(".")}: ${issue?.message}`);
  }
  return parsed.data;
}

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("user")) throw new UnauthorizedError();
  await next();
};

export function currentUser(c: Context<AppEnv>): User {
  const user = c.get("user");
  if (!user) throw new UnauthorizedError();
  return user;
}

export { day } from "../application/analytics/query-options";

/**
 * zod fills defaults even inside a partial schema, so a PATCH that omits a field would reset
 * it. Keeps only the keys the client actually sent.
 */
export async function readPatch(c: Context, schema: z.ZodObject): Promise<never> {
  const parsed = (await readJson(c, schema.partial() as z.ZodType)) as Record<string, unknown>;
  const sent = Object.keys((await c.req.json()) as object);
  return Object.fromEntries(sent.filter((k) => k in parsed).map((k) => [k, parsed[k]])) as never;
}
