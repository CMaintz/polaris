import { PermanentJobError } from "../errors";
import type { Job } from "../jobs/ports";
import type { AiProvider } from "../ai/ports";
import type { PromptTemplate } from "../ai/prompts";
import { type RecorderDeps, jobStructuredCall } from "../ai/recorded-call";
import type { ModelSource } from "./ports";

export interface CallDeps extends RecorderDeps {
  models: ModelSource;
}

export async function requireModel(models: ModelSource, userId: string): Promise<AiProvider> {
  const provider = await models.activeProvider(userId);
  if (!provider) throw new PermanentJobError("No AI key is configured");
  return provider;
}

export async function modelCall<T>(
  deps: CallDeps,
  job: Job,
  template: PromptTemplate<T>,
  prompt: string,
  inputSummary: Record<string, unknown>,
): Promise<{ data: T; interactionId: string }> {
  const provider = await requireModel(deps.models, job.userId);
  const summary = { ...inputSummary, provider: provider.id };
  const call = { template, prompt };
  const { value, interactionId } = await jobStructuredCall(deps, job, provider, call, summary);
  return { data: value, interactionId };
}
