import OpenAI, { type ClientOptions } from "openai";
import { AiProviderError } from "../../application/ai/ports";
import { translateOpenAiError } from "../ai/openai-provider";
import type {
  Embedder,
  EmbedderLookup,
  EmbedderSource,
  EmbeddingResult,
  KeySource,
} from "../../application/knowledge/ports";

const EMBEDDING_MODEL = "text-embedding-3-small";

export class OpenAiEmbedder implements Embedder {
  readonly provider = "openai" as const;
  readonly model = EMBEDDING_MODEL;
  private readonly client: OpenAI;

  constructor(apiKey: string, options: Pick<ClientOptions, "fetch" | "maxRetries"> = {}) {
    this.client = new OpenAI({ apiKey, maxRetries: 2, ...options });
  }

  async embed(texts: string[]): Promise<EmbeddingResult> {
    let response;
    try {
      response = await this.client.embeddings.create({
        model: this.model,
        input: texts,
        encoding_format: "float",
      });
    } catch (error) {
      throw translateOpenAiError(error);
    }
    const ordered = [...response.data].sort((a, b) => a.index - b.index);
    if (ordered.length !== texts.length)
      throw new AiProviderError("invalid_output", "OpenAI returned the wrong number of embeddings");
    return {
      vectors: ordered.map((d) => Float32Array.from(d.embedding)),
      model: response.model,
      inputTokens: response.usage?.prompt_tokens ?? null,
    };
  }
}

/** Meaning search runs on the user's active key, and only OpenAI offers embeddings (ADR 0017). */
export class KeyedEmbedderSource implements EmbedderSource {
  constructor(
    private readonly keys: KeySource,
    private readonly create: (apiKey: string) => Embedder = (key) => new OpenAiEmbedder(key),
  ) {}

  async forUser(userId: string): Promise<EmbedderLookup> {
    const key = await this.keys.activeKey(userId);
    if (!key)
      return { embedder: null, reason: "Meaning search needs an OpenAI key. Add one in Settings." };
    if (key.provider !== "openai")
      return {
        embedder: null,
        reason:
          "Meaning search needs an OpenAI key; your active key is Anthropic, which has no embeddings API.",
      };
    return { embedder: this.create(key.apiKey), reason: null };
  }
}
