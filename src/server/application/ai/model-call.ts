import type { Clock } from "../clock";
import type { Job } from "../jobs/ports";
import type { AiProvider } from "./ports";
import { type Prepared, inputSummary, promptFor } from "./prepared";
import type { PromptTemplate } from "./prompts";
import { jobStructuredCall } from "./recorded-call";
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
  const template = prepared.template as PromptTemplate<unknown>;
  const call = { template, prompt: promptFor(prepared) };
  const summary = inputSummary(prepared, provider.id);
  const { value, interactionId } = await jobStructuredCall(recorder, job, provider, call, summary);
  return { output: value, interactionId };
}
