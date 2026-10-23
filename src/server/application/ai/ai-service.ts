import type { AnalyticsService } from "../analytics/analytics-service";
import type { AuditLog } from "../auth/ports";
import { type Clock, nowIso } from "../clock";
import type { ContentStore } from "../content/ports";
import { ConflictError, NotFoundError, PermanentJobError, ValidationError } from "../errors";
import type { Job, JobRepository } from "../jobs/ports";
import type { EvidenceItem } from "../../domain/insights";
import type { CredentialService } from "./credentials";
import { type EvidencePack, accountEvidence, disclosure, postEvidence } from "./evidence";
import { adjustConfidence, ground } from "./grounding";
import { SECTIONS, classifyQuestion } from "./intent";
import { type AiProvider, AiProviderError } from "./ports";
import {
  ACCOUNT_REVIEW,
  ASK_DATA,
  type Analysis,
  type Answer,
  POST_REVIEW,
  type PromptTemplate,
  renderPrompt,
} from "./prompts";
import type { AiStore } from "./store";

export const AI_JOB = "ai";
const MAX_QUESTION = 500;

type Task =
  | { task: "account_review" }
  | { task: "post_review"; postId: string }
  | { task: "ask"; question: string };
type Payload = Task & { tz: number; label: string };

export interface AnswerResult {
  answer: string;
  caveats: string[];
  evidence: EvidenceItem[];
  intent: string;
  basedOnDemoData: boolean;
  interactionId: string;
}

interface Prepared {
  template: PromptTemplate<Analysis> | PromptTemplate<Answer>;
  pack: EvidencePack;
  extra: Record<string, unknown>;
}

export interface AiDeps {
  credentials: CredentialService;
  analytics: AnalyticsService;
  content: ContentStore;
  store: AiStore;
  jobs: JobRepository;
  audit: AuditLog;
  clock: Clock;
}

export class AiService {
  constructor(private readonly deps: AiDeps) {}

  async startAccountReview(userId: string, tz: number): Promise<Job> {
    return this.enqueue(userId, { task: "account_review", tz, label: "Account review" });
  }

  async startPostReview(userId: string, postId: string, tz: number): Promise<Job> {
    await this.deps.analytics.post(userId, postId); // 404s for posts the user does not own
    return this.enqueue(userId, { task: "post_review", postId, tz, label: "Post review" });
  }

  async ask(userId: string, question: string, tz: number): Promise<Job> {
    const trimmed = question.trim();
    if (!trimmed || trimmed.length > MAX_QUESTION) {
      throw new ValidationError(`Ask a question of 1 to ${MAX_QUESTION} characters`);
    }
    return this.enqueue(userId, { task: "ask", question: trimmed, tz, label: "Question" });
  }

  async run(job: Job): Promise<unknown> {
    const payload = job.payload as Payload;
    const provider = await this.deps.credentials.activeProvider(job.userId);
    if (!provider) throw new PermanentJobError("No AI key is configured");
    const status = (await this.deps.analytics.dashboard(job.userId, 28, payload.tz)).status;
    const prepared = await this.prepare(job.userId, payload);
    const demo = status.hasDemoData;
    const question = payload.task === "ask" ? payload.question : undefined;
    const data = await this.call(job, provider, prepared, demo, question);
    return this.persist(job, payload, prepared, data, demo);
  }

  private async enqueue(userId: string, payload: Payload): Promise<Job> {
    if ((await this.deps.credentials.list(userId)).length === 0) {
      throw new ConflictError("Add an OpenAI or Anthropic API key in Settings first");
    }
    const account = await this.deps.content.findAccount(userId);
    if (!account || !(await this.hasData(account.id))) {
      throw new ConflictError("Import your LinkedIn data before asking for an AI review");
    }
    return this.deps.jobs.enqueue(
      { userId, type: AI_JOB, payload: { ...payload }, maxRetries: 2 },
      nowIso(this.deps.clock),
    );
  }

  private async hasData(accountId: string): Promise<boolean> {
    return (
      (await this.deps.content.hasDataset(accountId, "linkedin")) ||
      this.deps.content.hasDataset(accountId, "demo")
    );
  }

  private async prepare(userId: string, payload: Payload): Promise<Prepared> {
    const { analytics } = this.deps;
    if (payload.task === "post_review") {
      return {
        template: POST_REVIEW,
        pack: postEvidence(await analytics.post(userId, payload.postId)),
        extra: { postId: payload.postId },
      };
    }
    const dashboard = await analytics.dashboard(userId, 28, payload.tz);
    const breakdowns = await analytics.breakdowns(userId, payload.tz);
    if (payload.task === "account_review") {
      return { template: ACCOUNT_REVIEW, pack: accountEvidence(dashboard, breakdowns), extra: {} };
    }
    const intent = classifyQuestion(payload.question);
    return {
      template: ASK_DATA,
      pack: accountEvidence(dashboard, breakdowns, SECTIONS[intent]),
      extra: { intent },
    };
  }

  private async call(
    job: Job,
    provider: AiProvider,
    prepared: Prepared,
    demo: boolean,
    question?: string,
  ) {
    const { template, pack } = prepared;
    const base = {
      userId: job.userId,
      jobId: job.id,
      provider: provider.id,
      promptName: template.name,
      promptVersion: template.version,
      inputSummary: { ...disclosure(pack), ...prepared.extra, provider: provider.id, demo },
      createdAt: nowIso(this.deps.clock),
    };
    try {
      const result = await provider.generateStructured<unknown>({
        system: template.system,
        prompt: renderPrompt(pack, { demo, question }),
        schema: template.schema,
        schemaName: template.schemaName,
        maxTokens: template.maxTokens,
      });
      const interactionId = await this.deps.store.recordInteraction({
        ...base,
        model: result.model,
        status: "succeeded",
        output: result.data,
        error: null,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      });
      return { output: result.data, interactionId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.deps.store.recordInteraction({
        ...base,
        model: provider.model,
        status: "failed",
        output: null,
        error: message,
        inputTokens: null,
        outputTokens: null,
      });
      // Rate limits and outages are worth the job's retries; a bad key or refusal is not.
      if (error instanceof AiProviderError && error.retryable) throw error;
      throw new PermanentJobError(message);
    }
  }

  private async persist(
    job: Job,
    payload: Payload,
    prepared: Prepared,
    data: { output: unknown; interactionId: string },
    demo: boolean,
  ) {
    const account = await this.deps.content.findAccount(job.userId);
    if (!account) throw new NotFoundError("Account");
    if (payload.task === "ask")
      return this.answer(data.output as Answer, prepared, demo, data.interactionId);
    const analysis = data.output as Analysis;
    const common = {
      basedOnDemo: demo,
      createdAt: nowIso(this.deps.clock),
      interactionId: data.interactionId,
    };
    const scope =
      payload.task === "post_review"
        ? { scope: "post" as const, postId: payload.postId }
        : { scope: "account" as const, postId: null };
    await this.deps.store.saveInsights(
      account.id,
      groundedInsights(analysis, prepared.pack, { ...common, ...scope }),
    );
    await this.deps.store.saveRecommendations(
      account.id,
      groundedRecommendations(analysis, prepared.pack, common),
    );
    await this.deps.audit.record(job.userId, "ai.analysis_saved", { task: payload.task });
    return { summary: analysis.summary, interactionId: data.interactionId, basedOnDemoData: demo };
  }

  private answer(
    output: Answer,
    prepared: Prepared,
    demo: boolean,
    interactionId: string,
  ): AnswerResult {
    const grounded = ground(output.evidenceIds, prepared.pack);
    const caveats = [...output.caveats];
    if (grounded.invented.length > 0)
      caveats.push("Some cited figures were not in your data and were removed.");
    return {
      answer: output.answer,
      caveats,
      evidence: grounded.evidence,
      intent: String(prepared.extra["intent"]),
      basedOnDemoData: demo,
      interactionId,
    };
  }
}

interface Common {
  basedOnDemo: boolean;
  createdAt: string;
  interactionId: string;
}

function groundedInsights(
  analysis: Analysis,
  pack: EvidencePack,
  common: Common & { scope: "account" | "post"; postId: string | null },
) {
  return analysis.insights.slice(0, 6).map(({ evidenceIds, confidence, ...text }) => {
    const grounded = ground(evidenceIds, pack);
    return {
      ...common,
      ...text,
      confidence: adjustConfidence(confidence, grounded),
      evidence: grounded.evidence,
    };
  });
}

function groundedRecommendations(analysis: Analysis, pack: EvidencePack, common: Common) {
  return analysis.recommendations
    .slice(0, 5)
    .flatMap(({ evidenceIds, recommendation, rationale }) => {
      const grounded = ground(evidenceIds, pack);
      // A recommendation with no real evidence behind it is exactly what docs/01 rules out.
      if (grounded.evidence.length === 0) return [];
      return [
        {
          ...common,
          recommendation,
          rationale,
          evidence: grounded.evidence,
          status: "open" as const,
        },
      ];
    });
}
