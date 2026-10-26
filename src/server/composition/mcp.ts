import type { AnalyticsService } from "../application/analytics/analytics-service";
import { type Clock, systemClock } from "../application/clock";
import { loadConfig } from "../config";
import { SqliteUserRepository } from "../infrastructure/db/auth-repositories";
import { openReadOnlyDatabase } from "../infrastructure/db/database";
import type { UserRepository } from "../application/auth/ports";
import { buildAnalyticsReads } from "./analytics";

export interface McpContext {
  analytics: AnalyticsService;
  userId: string;
  close(): void;
}

/**
 * The MCP server's composition root: the web app's analytics reads over a read-only handle,
 * scoped to one user. Throws when the database or the user cannot be settled, so a
 * misconfigured client fails at start-up instead of answering from the wrong account.
 */
export async function openMcpContext(
  env: NodeJS.ProcessEnv,
  clock: Clock = systemClock,
): Promise<McpContext> {
  const db = openReadOnlyDatabase(loadConfig(env).dbPath);
  try {
    const userId = await resolveUserId(new SqliteUserRepository(db), env.POLARIS_USER_ID);
    return { analytics: buildAnalyticsReads(db, clock).analytics, userId, close: () => db.close() };
  } catch (error) {
    db.close();
    throw error;
  }
}

// Falling back to the only user keeps a single-user install zero-config; with several users
// any pick would be a guess, and a wrong guess shows one person another's data.
async function resolveUserId(
  users: Pick<UserRepository, "findById" | "ids">,
  configured: string | undefined,
) {
  if (configured) {
    if (!(await users.findById(configured))) throw new Error(`No Polaris user ${configured}`);
    return configured;
  }
  const ids = await users.ids();
  if (ids.length === 1 && ids[0]) return ids[0];
  throw new Error(
    `The database has ${ids.length} users; set POLARIS_USER_ID to choose whose data to serve`,
  );
}
