import type { EvidenceFacts } from "../analytics/evidence-facts";
import type { AuditLog } from "../auth/ports";
import { type Clock, nowIso } from "../clock";
import type { ContentStore, ResolveAccount } from "../content/ports";
import { ConflictError, NotFoundError, PermanentJobError, ValidationError } from "../errors";
import type { Job, JobRepository } from "../jobs/ports";
import { groundedAnswer, groundedInsights, groundedRecommendations } from "./grounded-output";
import { type AiPayload as Payload, parseAiPayload } from "./job-payload";
import { callModel } from "./model-call";
import type { AiProvider } from "./ports";
import { type Prepared, prepare } from "./prepared";
import type { RelatedPosts } from "./related-posts";
import type { Analysis, Answer } from "./prompts";
import type {
  InsightFilter,
  InsightStore,
  InteractionLog,
  InteractionRecord,
  RecommendationStatus,
} from "./store";

export const AI_JOB = "ai";
const MAX_QUESTION = 500;
const INTERACTION_LIMIT = 50;

export interface AiKeys {
  /** Null when the user has stored no key. */
  activeProvider(userId: string): Promise<AiProvider | null>;
  list(userId: string): Promise<readonly unknown[]>;
}

export interface AiDeps {
  credentials: AiKeys;
  facts: EvidenceFacts;
  related: RelatedPosts;
  content: Pick<ContentStore, "hasDataset">;
  resolveAccount: ResolveAccount;
  insights: InsightStore;
  interactions: InteractionLog;
  jobs: JobRepository;
  audit: AuditLog;
  clock: Clock;
}

/** An interaction as the user may see it: the model's raw output stays on the server. */
export type InteractionView = Omit<InteractionRecord, "output" | "userId"> & { id: string };

type Analysed = Exclude<Prepared, { task: "ask" }>;

export class AiService {
  constructor(private readonly deps: AiDeps) {}

  async startAccountReview(userId: string, tz: number): Promise<Job> {
    return this.enqueue(userId, { task: "account_review", tz, label: "Account review" });
  }

  async startPostReview(userId: string, postId: string, tz: number): Promise<Job> {
    await this.deps.facts.post(userId, postId); // 404s for posts the user does not own
    return this.enqueue(userId, { task: "post_review", postId, tz, label: "Post review" });
  }

  async ask(userId: string, question: string, tz: number): Promise<Job> {
    const trimmed = question.trim();
    if (!trimmed || trimmed.length > MAX_QUESTION) {
      throw new ValidationError(`Ask a question of 1 to ${MAX_QUESTION} characters`);
    }
    return this.enqueue(userId, { task: "ask", question: trimmed, tz, label: "Question" });
  }

  async insights(userId: string, filter: InsightFilter) {
    const accountId = await this.deps.resolveAccount(userId);
    return accountId ? this.deps.insights.insights(accountId, filter) : [];
  }

  async recommendations(userId: string) {
    const accountId = await this.deps.resolveAccount(userId);
    return accountId ? this.deps.insights.recommendations(accountId) : [];
  }

  async setRecommendationStatus(
    userId: string,
    id: string,
    status: RecommendationStatus,
  ): Promise<void> {
    const accountId = await this.deps.resolveAccount(userId);
    const now = nowIso(this.deps.clock);
    const updated = accountId
      ? await this.deps.insights.setRecommendationStatus(accountId, id, status, now)
      : false;
    if (!updated) throw new NotFoundError("Recommendation");
  }

  async interactions(userId: string): Promise<InteractionView[]> {
    const list = await this.deps.interactions.interactions(userId, INTERACTION_LIMIT);
    return list.map(({ output: _output, userId: _user, ...rest }) => rest);
  }

  async run(job: Job): Promise<unknown> {
    const payload = parseAiPayload(job.payload);
    const provider = await this.deps.credentials.activeProvider(job.userId);
    if (!provider) throw new PermanentJobError("No AI key is configured");
    const prepared = await prepare(this.deps, job, payload);
    const data = await callModel(this.deps, job, provider, prepared);
    return this.persist(job, prepared, data);
  }

  private async enqueue(userId: string, payload: Payload): Promise<Job> {
    if ((await this.deps.credentials.list(userId)).length === 0) {
      throw new ConflictError("Add an AI provider API key in Settings first");
    }
    const accountId = await this.deps.resolveAccount(userId);
    if (!accountId || !(await this.hasData(accountId))) {
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

  private async persist(
    job: Job,
    prepared: Prepared,
    data: { output: unknown; interactionId: string },
  ) {
    const { interactionId } = data;
    const basedOnDemoData = prepared.demo;
    if (prepared.task === "ask") {
      const context = { intent: prepared.intent, basedOnDemoData, interactionId };
      return groundedAnswer(data.output as Answer, prepared.pack, context);
    }
    const analysis = data.output as Analysis;
    await this.saveAnalysis(job.userId, prepared, analysis, interactionId);
    await this.deps.audit.record(job.userId, "ai.analysis_saved", { task: prepared.task });
    return { summary: analysis.summary, interactionId, basedOnDemoData };
  }

  private async saveAnalysis(
    userId: string,
    prepared: Analysed,
    analysis: Analysis,
    interactionId: string,
  ) {
    const accountId = await this.deps.resolveAccount(userId);
    if (!accountId) throw new NotFoundError("Account");
    const { pack } = prepared;
    const saved = { basedOnDemo: prepared.demo, createdAt: nowIso(this.deps.clock), interactionId };
    const scope =
      prepared.task === "post_review"
        ? { scope: "post" as const, postId: prepared.postId }
        : { scope: "account" as const, postId: null };
    const insights = groundedInsights(analysis, pack, { ...saved, ...scope });
    await this.deps.insights.saveInsights(accountId, insights);
    const recommendations = groundedRecommendations(analysis, pack, saved);
    await this.deps.insights.saveRecommendations(accountId, recommendations);
  }
}
