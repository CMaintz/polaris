import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import {
  type AiProvider,
  AiProviderError,
  type StructuredRequest,
  type StructuredResult,
} from "../../application/ai/ports";

/**
 * Maps SDK errors to provider-neutral kinds. Messages are fixed text: the provider's own
 * message can quote the request, and it ends up shown to the user and stored.
 */
export function translateAnthropicError(error: unknown): AiProviderError {
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return new AiProviderError("auth", "Anthropic rejected the API key");
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AiProviderError("rate_limit", "Anthropic rate limit reached");
  }
  if (error instanceof Anthropic.BadRequestError || error instanceof Anthropic.NotFoundError) {
    return new AiProviderError(
      "bad_request",
      `Anthropic rejected the request (${error.status}). Check the model name in Settings.`,
    );
  }
  if (error instanceof Anthropic.APIError) {
    return new AiProviderError(
      "unavailable",
      `Anthropic is unavailable (${error.status ?? "network"})`,
    );
  }
  // The SDK raises a plain AnthropicError when the answer fails to parse against the schema
  // (also after a refusal or a max_tokens cut-off). Retrying would re-bill the same failure.
  if (error instanceof Anthropic.AnthropicError) {
    return new AiProviderError(
      "invalid_output",
      "The model's answer could not be used (it may have declined or been cut off)",
    );
  }
  return new AiProviderError("unavailable", "Could not reach Anthropic");
}

export class AnthropicProvider implements AiProvider {
  readonly id = "anthropic" as const;
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 2 });
  }

  async generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    let response;
    try {
      response = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: [{ role: "user", content: request.prompt }],
        // Reviews are judgement work; `high` rather than the model's default effort.
        output_config: { format: betaZodOutputFormat(request.schema), effort: "high" },
        // A safety-classifier decline is retried server-side on Anthropic's recommended model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
    } catch (error) {
      throw translateAnthropicError(error);
    }
    if (response.stop_reason === "refusal") {
      throw new AiProviderError("refusal", "The model declined this request");
    }
    if (response.parsed_output === null || response.parsed_output === undefined) {
      throw new AiProviderError(
        "invalid_output",
        "The model's answer did not match the expected format",
      );
    }
    return {
      data: response.parsed_output as T,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
