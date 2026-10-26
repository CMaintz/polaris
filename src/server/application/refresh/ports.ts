import type { Platform } from "../../domain/accounts";
import type { ImportBundle } from "../../domain/content";

/** Provider id of figures read from LinkedIn's API, as opposed to an uploaded export. */
export const LINKEDIN_API = "linkedin-api";

/** Whether an account's LinkedIn connection may read statistics, and if not, why. */
export type AnalyticsAccess =
  "granted" | "not_enabled" | "not_connected" | "expired" | "missing_scopes";

export interface RefreshRequest {
  /** The refresh day; post figures are lifetime totals observed on it. */
  observedOn: string;
  /** Account days to read, `from` included and `until` excluded; null reads none. */
  days: { from: string; until: string } | null;
  /** External ids of the posts to read; only share and ugcPost URNs can be asked about. */
  posts: string[];
}

export interface LinkedInAnalytics {
  access(accountId: string): Promise<AnalyticsAccess>;
  /** Throws LinkedInApiError when LinkedIn refuses or fails. */
  fetch(accountId: string, request: RefreshRequest): Promise<ImportBundle>;
}

/**
 * "reconnect": the stored sign-in no longer works. "refused": LinkedIn will keep saying no,
 * so retrying cannot help. "unavailable": rate limits and outages, which pass.
 */
export type LinkedInFailure = "reconnect" | "refused" | "unavailable";

export class LinkedInApiError extends Error {
  constructor(
    message: string,
    readonly failure: LinkedInFailure,
  ) {
    super(message);
    this.name = "LinkedInApiError";
  }
}

export interface RefreshTargets {
  platform(accountId: string): Promise<Platform | null>;
  /** The last day LinkedIn's API reported the account's impressions for. */
  lastAccountDay(accountId: string): Promise<string | null>;
  /**
   * Refreshable posts published on or after `since`, then ones never refreshed through the
   * API, at most `limit`.
   */
  postsToRefresh(accountId: string, since: string, limit: number): Promise<string[]>;
  postCounts(accountId: string): Promise<{ refreshable: number; total: number }>;
}
