import type { Clock } from "../clock";
import type { Job } from "../jobs/ports";
import type { AiProvider } from "./ports";
import { type Prepared, inputSummary, promptFor } from "./prepared";
import type { PromptTemplate } from "./prompts";
import { structuredCall, toJobError } from "./recorded-call";
import type { InteractionLog } from "./store";

export interface ModelCallDeps {
  interactions: InteractionLog;
  clock: Clock;
}

export async function callModel(
  deps: ModelCallDeps,
  job: Job,
  provider: AiProvider,
  prepared: Prepared,
): Promise<{ output: unknown; interactionId: string }> {
  const recorder = { recorder: deps.interactions, clock: deps.clock };
  const context = {
    userId: job.userId,
    jobId: job.id,
    inputSummary: inputSummary(prepared, provider.id),
  };
  const template = prepared.template as PromptTemplate<unknown>;
  try {
    const call = { template, prompt: promptFor(prepared) };
    const { value, interactionId } = await structuredCall(recorder, context, provider, call);
    return { output: value, interactionId };
  } catch (error) {
    throw toJobError(error);
  }
}
