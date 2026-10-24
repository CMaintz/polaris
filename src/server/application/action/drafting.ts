import { PERIOD_DAYS } from "../../domain/dates";
import { z } from "zod";
import { checkPostLength } from "../../domain/drafts";
import { nowIso } from "../clock";
import { ConflictError, ValidationError } from "../errors";
import type { Job, JobRepository } from "../jobs/ports";
import { parsePayload } from "../jobs/payload";
import { type CallDeps, modelCall } from "./ai-call";
import type { DraftService } from "./drafts";
import type { AccountFactsSource, NewVersion } from "./ports";
import { DRAFT_WRITE, type DraftBrief, type DraftOutput, renderDraftPrompt } from "./prompts";
import { displayText } from "../../domain/content";
import type { PostRecord } from "../../domain/posts";

export const DRAFT_JOB = "action.draft";
const VOICE_EXAMPLES = 3;
const MAX_VOICE_TEXT = 1500;
const MAX_BRIEF = 500;

export interface DraftRequest extends DraftBrief {
  draftId: string | null;
  planItemId: string | null;
}

const payloadSchema = z.object({
  accountId: z.string(),
  topic: z.string(),
  angle: z.string(),
  tone: z.string(),
  draftId: z.string().nullable(),
  planItemId: z.string().nullable(),
});
type Payload = z.infer<typeof payloadSchema>;

export interface DraftingDeps extends CallDeps {
  drafts: DraftService;
  facts: AccountFactsSource;
  jobs: JobRepository;
}

/** AI drafting (docs/14). The output is prose, so it lands as a new draft version, never a post. */
export class DraftingService {
  constructor(private readonly deps: DraftingDeps) {}

  async start(userId: string, request: DraftRequest): Promise<Job> {
    assertBrief(request);
    const accountId = await this.deps.drafts.requireAccount(userId);
    if (request.draftId) await this.deps.drafts.find(userId, request.draftId);
    if (!(await this.deps.models.activeProvider(userId))) {
      throw new ConflictError("Add an OpenAI or Anthropic API key in Settings first");
    }
    const label = request.draftId ? "Rewrite draft" : "Write draft";
    return this.deps.jobs.enqueue(
      { userId, type: DRAFT_JOB, payload: { ...request, accountId, label }, maxRetries: 2 },
      nowIso(this.deps.clock),
    );
  }

  async run(job: Job): Promise<unknown> {
    const payload = parsePayload(payloadSchema, job.payload);
    const done = await this.deps.drafts.byJob(payload.accountId, job.id);
    if (done) return { draftId: done.id, version: done.version };
    const current = payload.draftId
      ? (await this.deps.drafts.find(job.userId, payload.draftId)).draft.text
      : null;
    const facts = await this.deps.facts.account(job.userId, PERIOD_DAYS, 0);
    const voice = voiceExamples(facts.topPosts);
    const demo = facts.basedOnDemo;
    const prompt = renderDraftPrompt({ brief: payload, voice, current, demo });
    const summary = { voiceExamples: voice.length, rewrite: current !== null, demo };
    const output = await modelCall(this.deps, job, DRAFT_WRITE, prompt, summary);
    return this.persist(job, payload, versionOf(output, demo, job.id));
  }

  private async persist(job: Job, payload: Payload, version: NewVersion) {
    const { drafts } = this.deps;
    const draft = payload.draftId
      ? await drafts.addVersion(payload.accountId, payload.draftId, version)
      : await drafts.createIn(
          payload.accountId,
          { title: payload.topic.slice(0, 200), planItemId: payload.planItemId },
          version,
        );
    return { draftId: draft.id, version: draft.version, jobId: job.id };
  }
}

function voiceExamples(top: PostRecord[]): string[] {
  return top.slice(0, VOICE_EXAMPLES).flatMap((p) => {
    const text = displayText(p.text);
    return text ? [text.slice(0, MAX_VOICE_TEXT)] : [];
  });
}

function versionOf(
  output: { data: DraftOutput; interactionId: string },
  demo: boolean,
  jobId: string,
): NewVersion {
  const length = checkPostLength(output.data.text);
  const warning = length.over
    ? `This draft is ${length.length} characters; LinkedIn allows ${length.limit}. Shorten it before approving.`
    : "";
  return {
    text: output.data.text,
    origin: "ai",
    notes: [output.data.notes, warning].filter(Boolean).join("\n"),
    interactionId: output.interactionId,
    basedOnDemo: demo,
    jobId,
  };
}

function assertBrief(request: DraftBrief): void {
  if (!request.topic.trim()) throw new ValidationError("Say what the post is about");
  for (const value of [request.topic, request.angle, request.tone]) {
    if (value.length > MAX_BRIEF) {
      throw new ValidationError(`Keep each part of the brief under ${MAX_BRIEF} characters`);
    }
  }
}
