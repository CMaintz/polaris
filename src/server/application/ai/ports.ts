import type { z } from "zod";

export type AiProviderId = "anthropic" | "openai";

export const DEFAULT_MODELS: Record<AiProviderId, string> = {
  anthropic: "claude-opus-5-5",
  openai: "gpt-5",
};

export interface StructuredRequest<T> {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  /** Identifier for the schema, used by providers that name their output formats. */
  schemaName: string;
  maxTokens: number;
}

export interface StructuredResult<T> {
  data: T;
  /** The model that actually answered, which can differ from the requested one. */
  model: string;
  usage: { inputTokens: number | null; outputTokens: number | null };
}

/** The only way application code reaches a model (ADR 0003, ADR 0014). */
export interface AiProvider {
  readonly id: AiProviderId;
  readonly model: string;
  generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>>;
}

export interface AiProviderFactory {
  create(provider: AiProviderId, apiKey: string, model: string): AiProvider;
}

export type AiFailure =
  "auth" | "rate_limit" | "refusal" | "invalid_output" | "unavailable" | "bad_request";

/** A provider failure in provider-neutral terms. Only `retryable` ones are worth another try. */
export class AiProviderError extends Error {
  constructor(
    readonly kind: AiFailure,
    message: string,
  ) {
    super(message);
    this.name = "AiProviderError";
  }

  get retryable(): boolean {
    return this.kind === "rate_limit" || this.kind === "unavailable";
  }
}

/** Encrypts small secrets at rest; the context binds a ciphertext to its owner. */
export interface SecretBox {
  seal(plaintext: string, context: string): string;
  open(sealed: string, context: string): string;
}
