import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { translateAnthropicError } from "./anthropic-errors";
import {
  type AiProvider,
  AiProviderError,
  type StructuredRequest,
  type StructuredResult,
} from "../../application/ai/ports";

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
