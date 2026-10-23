import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  type AiProvider,
  AiProviderError,
  type StructuredRequest,
  type StructuredResult,
} from "../../application/ai/ports";

function translate(error: unknown): AiProviderError {
  if (
    error instanceof OpenAI.AuthenticationError ||
    error instanceof OpenAI.PermissionDeniedError
  ) {
    return new AiProviderError("auth", "OpenAI rejected the API key");
  }
  if (error instanceof OpenAI.RateLimitError) {
    return new AiProviderError("rate_limit", "OpenAI rate limit reached");
  }
  if (error instanceof OpenAI.BadRequestError || error instanceof OpenAI.NotFoundError) {
    return new AiProviderError(
      "bad_request",
      `OpenAI rejected the request (${error.status}). Check the model name in Settings.`,
    );
  }
  if (error instanceof OpenAI.APIError) {
    return new AiProviderError(
      "unavailable",
      `OpenAI is unavailable (${error.status ?? "network"})`,
    );
  }
  // Parse failures surface as a plain OpenAIError; retrying would re-bill the same failure.
  if (error instanceof OpenAI.OpenAIError) {
    return new AiProviderError("invalid_output", "The model's answer could not be used");
  }
  return new AiProviderError("unavailable", "Could not reach OpenAI");
}

export class OpenAiProvider implements AiProvider {
  readonly id = "openai" as const;
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    this.client = new OpenAI({ apiKey, maxRetries: 2 });
  }

  async generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    let response;
    try {
      response = await this.client.responses.parse({
        model: this.model,
        instructions: request.system,
        input: request.prompt,
        max_output_tokens: request.maxTokens,
        text: { format: zodTextFormat(request.schema, request.schemaName) },
      });
    } catch (error) {
      throw translate(error);
    }
    if (response.output_parsed === null || response.output_parsed === undefined) {
      throw new AiProviderError(
        "invalid_output",
        "The model's answer did not match the expected format",
      );
    }
    return {
      data: response.output_parsed as T,
      model: response.model,
      usage: {
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
      },
    };
  }
}
