import { parsePayload } from "../jobs/payload";
import { type Clock, nowIso } from "../clock";
import { ConflictError, NotFoundError, PermanentJobError, ValidationError } from "../errors";
import type { Job, JobRepository } from "../jobs/ports";
import type {
  ResearchInput,
  ResearchReportBody,
  ResearchReportDto,
} from "../../../shared/intelligence-types";
import { type AccountContext, type PostSource, accountContext } from "./context";
import {
  type TemplateContext,
  recordedCall,
  structuredCall,
  toJobError,
} from "../ai/recorded-call";
import { type ResearchPayload, researchJob, researchPayload } from "./jobs";
import type {
  ActiveKey,
  InteractionRecorder,
  KeySource,
  Peer,
  PeerStore,
  ProviderSource,
  ReportStore,
  StoredReport,
  WebResearchFactory,
} from "./ports";
import {
  RESEARCH_REPORT,
  RESEARCH_SEARCH,
  renderReportPrompt,
  renderSearchPrompt,
} from "./prompts";
import { groundReport, numberSources } from "./research-grounding";

const MAX_QUESTION = 500;

export interface ResearchDeps {
  keys: KeySource;
  providers: ProviderSource;
  webResearch: WebResearchFactory;
  reports: ReportStore;
  peers: PeerStore;
  posts: PostSource;
  recorder: InteractionRecorder;
  jobs: JobRepository;
  clock: Clock;
}

export class ResearchService {
  constructor(private readonly deps: ResearchDeps) {}

  async start(userId: string, accountId: string, input: ResearchInput): Promise<Job> {
    const question = input.question.trim();
    if (!question || question.length > MAX_QUESTION) {
      throw new ValidationError(`Ask a question of 1 to ${MAX_QUESTION} characters`);
    }
    const peer = input.peerId ? await this.deps.peers.get(accountId, input.peerId) : null;
    if (input.peerId && !peer) throw new NotFoundError("Peer");
    if (!(await this.deps.keys.activeKey(userId))) {
      throw new ConflictError("Add an OpenAI or Anthropic API key in Settings first");
    }
    const job = await this.deps.jobs.enqueue(
      researchJob(userId, { accountId, question, peerId: peer?.id ?? null }),
      nowIso(this.deps.clock),
    );
    await this.ensureReport(job.id, { accountId, question, peerId: peer?.id ?? null }, peer);
    return job;
  }

  async list(accountId: string): Promise<ResearchReportDto[]> {
    return (await this.deps.reports.list(accountId, 30)).map(toDto);
  }

  async run(job: Job): Promise<{ reportId: string }> {
    const payload = parsePayload(researchPayload, job.payload);
    const existing = await this.deps.reports.get(payload.accountId, job.id);
    if (existing?.body) return { reportId: job.id };
    // A peer deleted since the run was scheduled leaves a question about no one in particular.
    const peer = payload.peerId
      ? await this.deps.peers.get(payload.accountId, payload.peerId)
      : null;
    await this.ensureReport(job.id, payload, peer);
    const key = await this.deps.keys.activeKey(job.userId);
    if (!key) throw new PermanentJobError("No AI key is configured");
    const context = await accountContext(this.deps.posts, payload.accountId);
    const body = await this.research(job, key, payload.question, peer, context);
    await this.deps.reports.complete(job.id, body, nowIso(this.deps.clock));
    return { reportId: job.id };
  }

  private ensureReport(id: string, payload: ResearchPayload, peer: Peer | null) {
    return this.deps.reports.ensure({
      id,
      accountId: payload.accountId,
      question: payload.question,
      peerId: peer?.id ?? null,
      peerName: peer?.name ?? null,
      createdAt: nowIso(this.deps.clock),
    });
  }

  private async research(
    job: Job,
    key: ActiveKey,
    question: string,
    peer: Peer | null,
    account: AccountContext,
  ): Promise<ResearchReportBody> {
    const searcher = this.deps.webResearch(key);
    const context = (inputSummary: Record<string, unknown>) => ({
      userId: job.userId,
      jobId: job.id,
      inputSummary: { peer: peer !== null, demo: account.hasDemoData, ...inputSummary },
    });
    const searchCall = {
      ...context({}),
      provider: key.provider,
      model: key.model,
      promptName: RESEARCH_SEARCH.name,
      promptVersion: RESEARCH_SEARCH.version,
    };
    try {
      const search = await recordedCall(this.deps, searchCall, async () => {
        const result = await searcher.research({
          system: RESEARCH_SEARCH.system,
          prompt: renderSearchPrompt(question, peer),
          maxTokens: RESEARCH_SEARCH.maxTokens,
        });
        const value = { text: result.text, sources: result.sources };
        return { value, model: result.model, output: value, ...result.usage };
      });
      const sources = numberSources(search.value.sources);
      const structured = await this.structure(job.userId, context, question, search.value, account);
      return groundReport(structured.value, sources, account, [
        search.interactionId,
        structured.interactionId,
      ]);
    } catch (error) {
      throw toJobError(error);
    }
  }

  private async structure(
    userId: string,
    context: (inputSummary: Record<string, unknown>) => TemplateContext,
    question: string,
    search: { text: string; sources: { url: string; title: string }[] },
    account: AccountContext,
  ) {
    const provider = await this.deps.providers.activeProvider(userId);
    if (!provider) throw new PermanentJobError("No AI key is configured");
    const summary = {
      sources: search.sources.length,
      topics: account.topics.length,
      posts: account.topPosts.length,
    };
    const prompt = renderReportPrompt(question, search.text, search.sources, account);
    return structuredCall(this.deps, context(summary), provider, {
      template: RESEARCH_REPORT,
      prompt,
    });
  }
}

function status(report: StoredReport): ResearchReportDto["status"] {
  if (report.body) return "completed";
  return report.jobStatus === "failed" ? "failed" : "running";
}

function toDto(report: StoredReport): ResearchReportDto {
  return {
    id: report.id,
    question: report.question,
    peerId: report.peerId,
    peerName: report.peerName,
    status: status(report),
    error: report.body ? null : report.jobError,
    createdAt: report.createdAt,
    completedAt: report.completedAt,
    report: report.body,
  };
}
