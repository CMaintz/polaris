import { type Clock, nowIso } from "../clock";
import { PermanentJobError } from "../errors";
import type { Job } from "../jobs/ports";
import { type AiProvider, AiProviderError, type StructuredResult } from "./ports";
import { type Prepared, inputSummary, requestFor } from "./prepared";
import type { InteractionLog, InteractionRecord } from "./store";

export interface ModelCallDeps {
  interactions: InteractionLog;
  clock: Clock;
}

/** Runs the prepared task against the model and records the call whether it worked or not. */
export async function callModel(
  deps: ModelCallDeps,
  job: Job,
  provider: AiProvider,
  prepared: Prepared,
): Promise<{ output: unknown; interactionId: string }> {
  const base = {
    userId: job.userId,
    jobId: job.id,
    provider: provider.id,
    promptName: prepared.template.name,
    promptVersion: prepared.template.version,
    inputSummary: inputSummary(prepared, provider.id),
    createdAt: nowIso(deps.clock),
  };
  try {
    const result = await provider.generateStructured<unknown>(requestFor(prepared));
    const interactionId = await deps.interactions.recordInteraction({
      ...base,
      ...succeeded(result),
    });
    return { output: result.data, interactionId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await deps.interactions.recordInteraction({ ...base, ...failed(provider.model, message) });
    throw toJobError(error, message);
  }
}

type Outcome = Pick<
  InteractionRecord,
  "model" | "status" | "output" | "error" | "inputTokens" | "outputTokens"
>;

const succeeded = (result: StructuredResult<unknown>): Outcome => ({
  model: result.model,
  status: "succeeded",
  output: result.data,
  error: null,
  inputTokens: result.usage.inputTokens,
  outputTokens: result.usage.outputTokens,
});

const failed = (model: string, message: string): Outcome => ({
  model,
  status: "failed",
  output: null,
  error: message,
  inputTokens: null,
  outputTokens: null,
});

/** Rate limits and outages are worth the job's retries; a bad key or refusal is not. */
function toJobError(error: unknown, message: string): unknown {
  if (error instanceof AiProviderError && error.retryable) return error;
  return new PermanentJobError(message);
}
