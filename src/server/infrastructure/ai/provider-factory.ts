import type { AiProvider, AiProviderFactory, AiProviderId } from "../../application/ai/ports";
import { AnthropicProvider } from "./anthropic-provider";
import { OpenAiProvider } from "./openai-provider";

const ADAPTERS: Record<AiProviderId, (apiKey: string, model: string) => AiProvider> = {
  anthropic: (apiKey, model) => new AnthropicProvider(apiKey, model),
  openai: (apiKey, model) => new OpenAiProvider(apiKey, model),
};

export class SdkProviderFactory implements AiProviderFactory {
  create(provider: AiProviderId, apiKey: string, model: string): AiProvider {
    return ADAPTERS[provider](apiKey, model);
  }
}
