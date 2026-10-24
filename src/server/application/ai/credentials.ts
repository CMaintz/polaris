import type { AuditLog } from "../auth/ports";
import { type Clock, nowIso } from "../clock";
import { ValidationError } from "../errors";
import {
  type AiProvider,
  type AiProviderFactory,
  type AiProviderId,
  DEFAULT_MODELS,
  type SecretBox,
} from "./ports";
import type { CredentialStore } from "./store";

/** What the API may reveal about a stored key: never the key itself. */
export interface CredentialView {
  provider: AiProviderId;
  model: string;
  keyHint: string;
  active: boolean;
}

export interface ActiveKey {
  provider: AiProviderId;
  apiKey: string;
  model: string;
}

const KEY_PATTERN = /^[A-Za-z0-9_\-.]{20,300}$/;

export class CredentialService {
  constructor(
    private readonly store: CredentialStore,
    private readonly box: SecretBox,
    private readonly factory: AiProviderFactory,
    private readonly audit: AuditLog,
    private readonly clock: Clock,
  ) {}

  async save(
    userId: string,
    provider: AiProviderId,
    apiKey: string,
    model?: string,
  ): Promise<CredentialView> {
    const key = apiKey.trim();
    if (!KEY_PATTERN.test(key)) throw new ValidationError("That does not look like an API key");
    const chosen = model?.trim() || DEFAULT_MODELS[provider];
    await this.store.saveCredential(
      userId,
      { provider, model: chosen, sealedKey: this.box.seal(key, userId), keyHint: key.slice(-4) },
      nowIso(this.clock),
    );
    // Only the provider is logged; the key, even partially, never reaches a log line.
    await this.audit.record(userId, "ai.key_saved", { provider });
    return { provider, model: chosen, keyHint: key.slice(-4), active: true };
  }

  async list(userId: string): Promise<CredentialView[]> {
    const credentials = await this.store.credentials(userId);
    return credentials.map(({ provider, model, keyHint, active }) => ({
      provider,
      model,
      keyHint,
      active,
    }));
  }

  async remove(userId: string, provider: AiProviderId): Promise<void> {
    await this.store.deleteCredential(userId, provider);
    await this.audit.record(userId, "ai.key_removed", { provider });
  }

  /** Null when no key is stored. */
  async activeProvider(userId: string): Promise<AiProvider | null> {
    const key = await this.activeKey(userId);
    return key && this.factory.create(key.provider, key.apiKey, key.model);
  }

  /**
   * The opened key, for adapters that need their own SDK client (embeddings, web search).
   * The caller must keep it in memory only: never log, store or return it.
   */
  async activeKey(userId: string): Promise<ActiveKey | null> {
    const credentials = await this.store.credentials(userId);
    const active = credentials.find((c) => c.active) ?? credentials[0];
    if (!active) return null;
    const apiKey = this.box.open(active.sealedKey, userId);
    return { provider: active.provider, apiKey, model: active.model };
  }
}
