import type { AiProvider, AiProviderId } from "../ai/ports";

export type ResolveAccount = (userId: string) => Promise<string | null>;

export interface ActiveKey {
  provider: AiProviderId;
  apiKey: string;
  model: string;
}

export interface KeySource {
  activeKey(userId: string): Promise<ActiveKey | null>;
}

export interface ProviderSource {
  activeProvider(userId: string): Promise<AiProvider | null>;
}

export type { InteractionRecorder } from "../ai/recorded-call";
