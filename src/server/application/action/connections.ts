import { PLATFORM_NAMES } from "../../domain/accounts";
import type { Account } from "../content/ports";
import { createHash, randomBytes } from "node:crypto";
import type { AuditLog } from "../auth/ports";
import { type Clock, nowIso } from "../clock";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import type {
  ConnectableProvider,
  ConnectionStatus,
  OAuthStateStore,
  PublishingProvider,
} from "./provider-ports";

const STATE_TTL_MS = 10 * 60 * 1000;

export interface ConnectionView extends ConnectionStatus {
  id: string;
  label: string;
  mode: PublishingProvider["mode"];
  connectable: boolean;
}

export interface ConnectionDeps {
  providers: PublishingProvider[];
  states: OAuthStateStore;
  /** The active account, or null before the user has any. */
  findAccount: (userId: string) => Promise<Account | null>;
  audit: AuditLog;
  clock: Clock;
}

const hashState = (state: string) => createHash("sha256").update(state).digest("hex");

function isConnectable(provider: PublishingProvider): provider is ConnectableProvider {
  return "authorizationUrl" in provider;
}

export class ConnectionService {
  constructor(private readonly deps: ConnectionDeps) {}

  async list(userId: string): Promise<ConnectionView[]> {
    const accountId = (await this.deps.findAccount(userId))?.id;
    return Promise.all(
      this.deps.providers.map(async (p) => ({
        id: p.id,
        label: p.label,
        mode: p.mode,
        connectable: isConnectable(p),
        ...(accountId
          ? await p.connectionStatus(accountId)
          : { state: "not_connected" as const, displayName: null, expiresAt: null }),
      })),
    );
  }

  /** The URL to send the browser to. The state is single-use and bound to this user. */
  async start(userId: string, providerId: string): Promise<string> {
    const provider = this.connectable(providerId);
    const accountId = (await this.connectableAccount(userId, provider)).id;
    const state = randomBytes(32).toString("base64url");
    const expiresAt = new Date(this.deps.clock().getTime() + STATE_TTL_MS).toISOString();
    const url = provider.authorizationUrl(state);
    await this.deps.states.save(hashState(state), {
      userId,
      accountId,
      provider: providerId,
      expiresAt,
    });
    return url;
  }

  async complete(
    userId: string,
    providerId: string,
    callback: { code?: string; state?: string; error?: string },
  ): Promise<void> {
    const provider = this.connectable(providerId);
    const saved = callback.state ? await this.deps.states.take(hashState(callback.state)) : null;
    const valid =
      saved?.userId === userId && saved.provider === providerId && saved.expiresAt > this.now();
    if (!saved || !valid) {
      throw new ForbiddenError("This sign-in link is invalid or has expired; connect again");
    }
    if (callback.error || !callback.code)
      throw new ValidationError("LinkedIn sign-in was cancelled");
    await provider.completeAuthorization(saved.accountId, callback.code);
    await this.deps.audit.record(userId, "publishing.connected", { provider: providerId });
  }

  async disconnect(userId: string, providerId: string): Promise<void> {
    const provider = this.connectable(providerId);
    await provider.disconnect((await this.account(userId)).id);
    await this.deps.audit.record(userId, "publishing.disconnected", { provider: providerId });
  }

  private connectable(providerId: string): ConnectableProvider {
    const provider = this.deps.providers.find((p) => p.id === providerId);
    if (!provider || !isConnectable(provider)) throw new NotFoundError("Connection");
    return provider;
  }

  private async account(userId: string): Promise<Account> {
    const account = await this.deps.findAccount(userId);
    if (!account) throw new ConflictError("Import your LinkedIn data or load the demo first");
    return account;
  }

  private async connectableAccount(userId: string, provider: ConnectableProvider) {
    const account = await this.account(userId);
    if (account.platform !== provider.platform) {
      const name = PLATFORM_NAMES[provider.platform];
      throw new ValidationError(`${provider.label} can only be connected to a ${name} account`);
    }
    return account;
  }

  private now() {
    return nowIso(this.deps.clock);
  }
}
