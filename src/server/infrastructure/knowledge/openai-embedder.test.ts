import { describe, expect, it } from "vitest";
import { AiProviderError } from "../../application/ai/ports";
import { KeyedEmbedderSource, OpenAiEmbedder } from "./openai-embedder";

const KEY = "sk-test-abcdefghijklmnopqrstuvwxyz";

function respondWith(status: number, body: unknown) {
  const requests: { url: string; body: unknown }[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetch: fetch as typeof globalThis.fetch, requests };
}

describe("OpenAiEmbedder", () => {
  it("returns vectors in input order even when the API lists them out of order", async () => {
    const { fetch, requests } = respondWith(200, {
      object: "list",
      model: "text-embedding-3-small",
      data: [
        { object: "embedding", index: 1, embedding: [0, 1] },
        { object: "embedding", index: 0, embedding: [1, 0] },
      ],
      usage: { prompt_tokens: 7, total_tokens: 7 },
    });
    const result = await new OpenAiEmbedder(KEY, { fetch }).embed(["first", "second"]);
    expect(result.vectors).toEqual([Float32Array.from([1, 0]), Float32Array.from([0, 1])]);
    expect(result.inputTokens).toBe(7);
    expect(requests[0]?.body).toMatchObject({
      model: "text-embedding-3-small",
      input: ["first", "second"],
    });
  });

  it("reports a rejected key as a non-retryable auth failure", async () => {
    const { fetch } = respondWith(401, { error: { message: "bad key" } });
    const embedder = new OpenAiEmbedder(KEY, { fetch, maxRetries: 0 });
    const error = await embedder.embed(["x"]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiProviderError);
    expect(error).toMatchObject({ kind: "auth", retryable: false });
  });
});

describe("KeyedEmbedderSource", () => {
  const source = (provider: "openai" | "anthropic" | null) =>
    new KeyedEmbedderSource(
      { activeKey: async () => (provider ? { provider, apiKey: KEY, model: "chat-model" } : null) },
      (apiKey) => ({
        provider: "openai",
        model: `embedder-for-${apiKey.slice(-4)}`,
        embed: async () => ({ vectors: [], model: "", inputTokens: null }),
      }),
    );

  it("embeds only with an active OpenAI key", async () => {
    expect((await source("openai").forUser("u")).embedder?.model).toBe("embedder-for-wxyz");
    const anthropic = await source("anthropic").forUser("u");
    expect(anthropic.embedder).toBeNull();
    expect(anthropic.reason).toContain("Anthropic");
    expect((await source(null).forUser("u")).reason).toContain("Add one in Settings");
  });
});
