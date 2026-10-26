import type { SecretBox } from "../../application/ai/ports";
import type { Clock } from "../../application/clock";
import {
  type AnalyticsAccess,
  LINKEDIN_API,
  LinkedInApiError,
  type LinkedInAnalytics,
  type RefreshRequest,
} from "../../application/refresh/ports";
import { type ImportBundle, emptyBundle } from "../../domain/content";
import type { ConnectionStore, StoredConnection } from "../publishing/connection-store";
import { ANALYTICS_SCOPES, type LinkedInAppConfig } from "../publishing/linkedin-oauth";
import { LINKEDIN_CONNECTION, sealContext } from "../publishing/linkedin-provider";
import { readAccountDays } from "./account-figures";
import { LinkedInRestClient } from "./client";
import { readPostFigures } from "./post-figures";
import { isApiPost } from "./restli";

/** Reads a member's statistics with the token their publishing connection holds. */
export class LinkedInAnalyticsSource implements LinkedInAnalytics {
  constructor(
    private readonly config: LinkedInAppConfig | null,
    private readonly connections: ConnectionStore,
    private readonly box: SecretBox,
    private readonly fetchFn: typeof fetch,
    private readonly clock: Clock,
  ) {}

  async access(accountId: string): Promise<AnalyticsAccess> {
    if (!this.config?.analytics) return "not_enabled";
    const c = await this.connections.get(accountId, LINKEDIN_CONNECTION);
    if (!c) return "not_connected";
    if (c.expiresAt !== null && c.expiresAt <= this.clock().toISOString()) return "expired";
    return ANALYTICS_SCOPES.every((s) => c.scopes.includes(s)) ? "granted" : "missing_scopes";
  }

  async fetch(accountId: string, request: RefreshRequest): Promise<ImportBundle> {
    const client = await this.client(accountId);
    const bundle = emptyBundle(LINKEDIN_API);
    if (request.days) bundle.accountDays = await readAccountDays(client, request.days);
    for (const urn of request.posts.filter(isApiPost)) {
      await this.readPost(client, urn, request.observedOn, bundle);
    }
    return bundle;
  }

  /** A post LinkedIn refuses (deleted, not the member's) is skipped, not the whole refresh. */
  private async readPost(
    client: LinkedInRestClient,
    urn: string,
    observedOn: string,
    into: ImportBundle,
  ) {
    try {
      into.postMetrics.push(await readPostFigures(client, urn, observedOn));
    } catch (error) {
      if (!(error instanceof LinkedInApiError) || error.failure !== "refused") throw error;
      into.warnings.push(`${urn}: ${error.message}`);
    }
  }

  private async client(accountId: string): Promise<LinkedInRestClient> {
    const c: StoredConnection | null = this.config
      ? await this.connections.get(accountId, LINKEDIN_CONNECTION)
      : null;
    if (!this.config || !c) throw new LinkedInApiError("LinkedIn is not connected", "refused");
    const token = this.box.open(c.sealedToken, sealContext(accountId));
    return new LinkedInRestClient(this.fetchFn, token, this.config.apiVersion);
  }
}
