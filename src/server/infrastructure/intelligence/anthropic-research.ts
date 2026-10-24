import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaMessage,
  BetaMessageParam,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { AiProviderError } from "../../application/ai/ports";
import type {
  WebResearchProvider,
  WebResearchRequest,
  WebResearchResult,
} from "../../application/intelligence/ports";
import { translateAnthropicError } from "../ai/anthropic-errors";
import { uniqueSources } from "./web-sources";

// The newest web search tool in @anthropic-ai/sdk 1.2.0 (WebSearchTool20260318).
const WEB_SEARCH = "web_search_20260318";
const MAX_SEARCHES = 5;
// The server-side search loop pauses after its own iteration limit; resuming a few times is
// enough for one question and bounds the cost of a runaway turn.
const MAX_RESUMES = 3;

export function anthropicFindings(content: BetaContentBlock[]) {
  const found: { url: string; title: string | null }[] = [];
  const text: string[] = [];
  for (const block of content) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const result of block.content) found.push({ url: result.url, title: result.title });
    }
    if (block.type === "text") {
      text.push(block.text);
      for (const citation of block.citations ?? []) {
        if (citation.type === "web_search_result_location") {
          found.push({ url: citation.url, title: citation.title });
        }
      }
    }
  }
  return { text: text.join(""), found };
}

export class AnthropicWebResearch implements WebResearchProvider {
  readonly id = "anthropic" as const;
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 2 });
  }

  async research(request: WebResearchRequest): Promise<WebResearchResult> {
    const messages: BetaMessageParam[] = [{ role: "user", content: request.prompt }];
    const content: BetaContentBlock[] = [];
    const usage = { inputTokens: 0, outputTokens: 0 };
    let response: BetaMessage;
    for (let turn = 0; ; turn++) {
      response = await this.send(request, messages);
      content.push(...response.content);
      usage.inputTokens += response.usage.input_tokens;
      usage.outputTokens += response.usage.output_tokens;
      if (response.stop_reason !== "pause_turn" || turn >= MAX_RESUMES) break;
      messages.push({ role: "assistant", content: response.content });
    }
    if (response.stop_reason === "refusal") {
      throw new AiProviderError("refusal", "The model declined this research question");
    }
    const { text, found } = anthropicFindings(content);
    return { text, sources: uniqueSources(found), model: response.model, usage };
  }

  private async send(request: WebResearchRequest, messages: BetaMessageParam[]) {
    try {
      return await this.client.beta.messages.create({
        model: this.model,
        max_tokens: request.maxTokens,
        system: request.system,
        messages,
        tools: [
          {
            type: WEB_SEARCH,
            name: "web_search",
            max_uses: MAX_SEARCHES,
            // Polaris never collects LinkedIn data by crawling (docs/07, ADR 0010).
            blocked_domains: ["linkedin.com"],
          },
        ],
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
    } catch (error) {
      throw translateAnthropicError(error);
    }
  }
}
