import {
  type ConnectableProvider,
  type ConnectionStatus,
  PublishError,
  type PublishResult,
} from "../../application/action/provider-ports";
import type { SecretBox } from "../../application/ai/ports";
import type { Clock } from "../../application/clock";
import { ConflictError } from "../../application/errors";
import type { ConnectionStore } from "./connection-store";
import { type LinkedInAppConfig, authorizationUrl, exchangeCode } from "./linkedin-oauth";
import { toLittleText } from "./little-text";

// https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
export const POSTS_URL = "https://api.linkedin.com/rest/posts";
const PROVIDER = "linkedin-api";
const TIMEOUT_MS = 30_000;

/**
 * Posts as the member through LinkedIn's official Posts API (docs/07: official API only).
 * Null config means the server has no LinkedIn app, and the provider reports "not_configured".
 */
export class LinkedInApiProvider implements ConnectableProvider {
  readonly id = PROVIDER;
  readonly label = "LinkedIn";
  readonly mode = "api" as const;

  constructor(
    private readonly config: LinkedInAppConfig | null,
    private readonly connections: ConnectionStore,
    private readonly box: SecretBox,
    private readonly fetchFn: typeof fetch,
    private readonly clock: Clock,
  ) {}

  async connectionStatus(accountId: string): Promise<ConnectionStatus> {
    if (!this.config) return { state: "not_configured", displayName: null, expiresAt: null };
    const c = await this.connections.get(accountId, PROVIDER);
    if (!c) return { state: "not_connected", displayName: null, expiresAt: null };
    const expired = c.expiresAt !== null && c.expiresAt <= this.clock().toISOString();
    return {
      state: expired ? "expired" : "connected",
      displayName: c.displayName,
      expiresAt: c.expiresAt,
    };
  }

  authorizationUrl(state: string): string {
    return authorizationUrl(this.app(), state);
  }

  async completeAuthorization(accountId: string, code: string): Promise<void> {
    const grant = await exchangeCode(this.app(), code, this.fetchFn);
    const now = this.clock();
    const expiresAt = Number.isFinite(grant.expiresIn)
      ? new Date(now.getTime() + grant.expiresIn * 1000).toISOString()
      : null;
    const sealedToken = this.box.seal(grant.accessToken, sealContext(accountId));
    const connection = {
      sealedToken,
      memberUrn: `urn:li:person:${grant.memberId}`,
      displayName: grant.name,
      expiresAt,
    };
    await this.connections.save(accountId, PROVIDER, connection, now.toISOString());
  }

  async disconnect(accountId: string): Promise<void> {
    await this.connections.delete(accountId, PROVIDER);
  }

  async publish(accountId: string, text: string): Promise<PublishResult> {
    const c = await this.connections.get(accountId, PROVIDER);
    if (!c) throw new PublishError("LinkedIn is not connected", "not_published");
    const token = this.box.open(c.sealedToken, sealContext(accountId));
    const response = await this.send(token, postBody(c.memberUrn, text));
    if (response.status === 201 || response.status === 200) {
      const id = response.headers.get("x-restli-id");
      return { externalId: id, url: id ? `https://www.linkedin.com/feed/update/${id}/` : null };
    }
    throw rejection(response.status);
  }

  private async send(token: string, body: object): Promise<Response> {
    try {
      return await this.fetchFn(POSTS_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "linkedin-version": this.app().apiVersion,
          "x-restli-protocol-version": "2.0.0",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      // A timeout or reset after the request left may still have created the post.
      throw new PublishError("Could not reach LinkedIn", "unknown");
    }
  }

  private app(): LinkedInAppConfig {
    if (!this.config) throw new ConflictError("LinkedIn publishing is not set up on this server");
    return this.config;
  }
}

/** Binds a sealed token to its account, so a token copied to another row fails to open. */
const sealContext = (accountId: string) => `publishing:${PROVIDER}:${accountId}`;

function postBody(author: string, text: string) {
  return {
    author,
    commentary: toLittleText(text),
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
}

/** A 4xx means LinkedIn refused the request, so nothing was posted; a 5xx may have half-worked. */
function rejection(status: number): PublishError {
  if (status === 401)
    return new PublishError(
      "LinkedIn rejected the stored sign-in; reconnect LinkedIn",
      "not_published",
    );
  if (status === 429)
    return new PublishError(
      "LinkedIn's rate limit was reached; schedule it again later",
      "not_published",
    );
  if (status < 500)
    return new PublishError(`LinkedIn refused the post (${status})`, "not_published");
  return new PublishError(`LinkedIn failed while posting (${status})`, "unknown");
}
