import type { AiProvider, AiProviderFactory, AiProviderId } from "../../application/ai/ports";
import { AnthropicProvider } from "./anthropic-provider";
import { OpenAiProvider } from "./openai-provider";

export class SdkProviderFactory implements AiProviderFactory {
  create(provider: AiProviderId, apiKey: string, model: string): AiProvider {
    return provider === "anthropic"
      ? new AnthropicProvider(apiKey, model)
      : new OpenAiProvider(apiKey, model);
  }
}
