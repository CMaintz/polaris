import OpenAI from "openai";
import type { Response, ResponseOutputItem } from "openai/resources/responses/responses";
import { AiProviderError } from "../../application/ai/ports";
import type {
  WebResearchProvider,
  WebResearchRequest,
  WebResearchResult,
} from "../../application/intelligence/ports";
import { translateOpenAiError } from "../ai/openai-provider";
import { uniqueSources } from "./web-sources";

export function openAiSources(output: ResponseOutputItem[]) {
  const found: { url: string; title: string | null }[] = [];
  for (const item of output) {
    if (item.type === "message") {
      for (const part of item.content) {
        if (part.type !== "output_text") continue;
        for (const note of part.annotations) {
          if (note.type === "url_citation") found.push({ url: note.url, title: note.title });
        }
      }
    }
    if (item.type === "web_search_call" && item.action.type === "search") {
      for (const source of item.action.sources ?? []) found.push({ url: source.url, title: null });
    }
  }
  return found;
}

export class OpenAiWebResearch implements WebResearchProvider {
  readonly id = "openai" as const;
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    this.client = new OpenAI({ apiKey, maxRetries: 2 });
  }

  async research(request: WebResearchRequest): Promise<WebResearchResult> {
    let response: Response;
    try {
      response = await this.client.responses.create({
        model: this.model,
        instructions: request.system,
        input: request.prompt,
        max_output_tokens: request.maxTokens,
        tools: [{ type: "web_search" }],
        include: ["web_search_call.action.sources"],
      });
    } catch (error) {
      throw translateOpenAiError(error);
    }
    if (!response.output_text) {
      throw new AiProviderError("invalid_output", "The model returned no research notes");
    }
    return {
      text: response.output_text,
      sources: uniqueSources(openAiSources(response.output)),
      model: response.model,
      usage: {
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
      },
    };
  }
}
