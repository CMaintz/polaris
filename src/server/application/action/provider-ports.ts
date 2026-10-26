import type { Platform } from "../../domain/accounts";

export type ConnectionState = "connected" | "not_connected" | "expired" | "not_configured";

export interface ConnectionStatus {
  state: ConnectionState;
  displayName: string | null;
  expiresAt: string | null;
}

export interface PublishResult {
  externalId: string | null;
  url: string | null;
}

/**
 * Where an approved draft goes. An "api" provider posts it; a "handoff" provider only
 * prepares it (a share link) and the user posts it and confirms.
 */
export interface PublishingProvider {
  readonly id: string;
  readonly label: string;
  readonly mode: "api" | "handoff";
  connectionStatus(accountId: string): Promise<ConnectionStatus>;
  /** Throws PublishError; `outcome` says whether the post may exist anyway. */
  publish(accountId: string, text: string): Promise<PublishResult>;
}

export interface ConnectableProvider extends PublishingProvider {
  /** The only account platform this connection may be attached to. */
  readonly platform: Platform;
  authorizationUrl(state: string): string;
  completeAuthorization(accountId: string, code: string): Promise<void>;
  disconnect(accountId: string): Promise<void>;
}

export class PublishError extends Error {
  constructor(
    message: string,
    /** "unknown" when the request may have reached LinkedIn (timeout, 5xx). */
    readonly outcome: "not_published" | "unknown",
  ) {
    super(message);
    this.name = "PublishError";
  }
}

export interface OAuthState {
  userId: string;
  accountId: string;
  provider: string;
  expiresAt: string;
}

export interface OAuthStateStore {
  save(stateHash: string, state: OAuthState): Promise<void>;
  /** Returns and deletes the state, so each one works once. */
  take(stateHash: string): Promise<OAuthState | null>;
}
