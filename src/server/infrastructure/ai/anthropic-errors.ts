import Anthropic from "@anthropic-ai/sdk";
import { AiProviderError } from "../../application/ai/ports";

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
