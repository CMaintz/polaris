import type { AiProvider, AiProviderFactory, StructuredRequest } from "../application/ai/ports";
import type { JobDto } from "../../shared/core-types";
import { signedInClient, testContainer } from "../test-support";

export const KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123";

type Respond = (request: StructuredRequest<unknown>) => unknown;

class FakeFactory implements AiProviderFactory {
  readonly calls: StructuredRequest<unknown>[] = [];
  readonly keys: string[] = [];
  constructor(private readonly respond: Respond) {}

  create(provider: "anthropic" | "openai", apiKey: string, model: string): AiProvider {
    this.keys.push(apiKey);
    return {
      id: provider,
      model,
      generateStructured: async <T>(request: StructuredRequest<T>) => {
        this.calls.push(request as StructuredRequest<unknown>);
        const data = request.schema.parse(this.respond(request as StructuredRequest<unknown>));
        return { data, model, usage: { inputTokens: 100, outputTokens: 50 } };
      },
    };
  }
}

export const analysis = (evidenceIds: string[], confidence = "high") => ({
  summary: "Steady account.",
  insights: [
    {
      title: "Documents work",
      observation: "o",
      interpretation: "i",
      confidence,
      action: "a",
      signal: "s",
      evidenceIds,
    },
  ],
  recommendations: [{ recommendation: "Post more documents", rationale: "r", evidenceIds }],
});

export async function aiKit(respond: Respond, withKey = true) {
  const factory = new FakeFactory(respond);
  const container = testContainer({}, { aiFactory: factory });
  const client = await signedInClient(container);
  await client.request("/imports/demo", { method: "POST" });
  await container.worker.drain();
  if (withKey) {
    await client.request("/ai/credentials/anthropic", {
      method: "PUT",
      body: JSON.stringify({ apiKey: KEY }),
    });
  }
  const run = async (path: string, body: object = { tz: 0 }) => {
    const response = await client.request(path, { method: "POST", body: JSON.stringify(body) });
    const { job } = (await response.json()) as { job: JobDto };
    await container.worker.drain();
    return ((await (await client.request(`/jobs/${job.id}`)).json()) as { job: JobDto }).job;
  };
  return { factory, container, client, run };
}

export type AiKit = Awaited<ReturnType<typeof aiKit>>;

/** Runs an account review and returns the id of the first recommendation it saved. */
export async function firstRecommendationId({ run, client }: AiKit) {
  await run("/ai/reviews/account");
  const { recommendations } = (await (await client.request("/ai/recommendations")).json()) as {
    recommendations: { id: string }[];
  };
  return recommendations[0]?.id;
}
