import { type Clock, nowIso } from "../clock";
import { PermanentJobError } from "../errors";
import { type AiProvider, AiProviderError, type AiProviderId } from "./ports";
import type { PromptTemplate } from "./prompts";
import type { InteractionLog, InteractionRecord } from "./store";

export type InteractionRecorder = Pick<InteractionLog, "recordInteraction">;

export interface RecorderDeps {
  recorder: InteractionRecorder;
  clock: Clock;
}

export interface CallContext {
  userId: string;
  jobId: string | null;
  provider: AiProviderId;
  model: string;
  promptName: string;
  promptVersion: string;
  inputSummary: Record<string, unknown>;
}

export interface CallOutcome<T> {
  value: T;
  model: string;
  /** What ai_interactions keeps, which can be less than `value` (no vectors, no post text). */
  output: unknown;
  inputTokens: number | null;
  outputTokens: number | null;
}

type Recorded = Pick<
  InteractionRecord,
  "model" | "status" | "output" | "error" | "inputTokens" | "outputTokens"
>;

/**
 * Every model call is recorded in ai_interactions, failed or not (ADR 0014). The error is
 * rethrown as it came, so the caller decides how a job should treat it (see `toJobError`).
 */
export async function recordedCall<T>(
  deps: RecorderDeps,
  context: CallContext,
  call: () => Promise<CallOutcome<T>>,
): Promise<{ value: T; model: string; interactionId: string }> {
  const record = (outcome: Recorded) =>
    deps.recorder.recordInteraction({ ...context, ...outcome, createdAt: nowIso(deps.clock) });
  try {
    const { value, ...outcome } = await call();
    const interactionId = await record({ ...outcome, status: "succeeded", error: null });
    return { value, model: outcome.model, interactionId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const empty = { output: null, inputTokens: null, outputTokens: null };
    await record({ ...empty, model: context.model, status: "failed", error: message });
    throw error;
  }
}

export type TemplateContext = Omit<
  CallContext,
  "provider" | "model" | "promptName" | "promptVersion"
>;

export function structuredCall<T>(
  deps: RecorderDeps,
  context: TemplateContext,
  provider: AiProvider,
  call: { template: PromptTemplate<T>; prompt: string },
): Promise<{ value: T; model: string; interactionId: string }> {
  const { template, prompt } = call;
  const full: CallContext = {
    ...context,
    provider: provider.id,
    model: provider.model,
    promptName: template.name,
    promptVersion: template.version,
  };
  return recordedCall(deps, full, async () => {
    const { system, schema, schemaName, maxTokens } = template;
    const result = await provider.generateStructured({
      system,
      prompt,
      schema,
      schemaName,
      maxTokens,
    });
    const { inputTokens, outputTokens } = result.usage;
    return {
      value: result.data,
      model: result.model,
      output: result.data,
      inputTokens,
      outputTokens,
    };
  });
}

/** Rate limits and outages are worth the job's retries; a bad key, refusal or bad output is not. */
export function toJobError(error: unknown): unknown {
  if (error instanceof AiProviderError && error.retryable) return error;
  return new PermanentJobError(error instanceof Error ? error.message : String(error));
}
