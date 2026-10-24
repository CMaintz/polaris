import { type CallContext, type RecorderDeps, recordedCall } from "../ai/recorded-call";
import type { Embedder } from "./ports";

export async function recordedEmbedding(
  deps: RecorderDeps,
  embedder: Embedder,
  context: Omit<CallContext, "provider" | "model">,
  texts: string[],
): Promise<Float32Array[]> {
  const call = { ...context, provider: embedder.provider, model: embedder.model };
  const { value } = await recordedCall(deps, call, async () => {
    const result = await embedder.embed(texts);
    return {
      value: result.vectors,
      model: result.model,
      output: { vectors: result.vectors.length, dimensions: result.vectors[0]?.length ?? null },
      inputTokens: result.inputTokens,
      outputTokens: null,
    };
  });
  return value;
}
