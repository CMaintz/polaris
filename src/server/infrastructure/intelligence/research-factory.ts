import type { ActiveKey, WebResearchProvider } from "../../application/intelligence/ports";
import { AnthropicWebResearch } from "./anthropic-research";
import { OpenAiWebResearch } from "./openai-research";

export function createWebResearch(key: ActiveKey): WebResearchProvider {
  return key.provider === "anthropic"
    ? new AnthropicWebResearch(key.apiKey, key.model)
    : new OpenAiWebResearch(key.apiKey, key.model);
}
