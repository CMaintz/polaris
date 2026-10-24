import type { ResolveAccount } from "../content/ports";
import { PERIOD_DAYS, todayUtc } from "../../domain/dates";
import { type ProposalKind, inWindow, planningWindow } from "../../domain/proposals";
import { nowIso } from "../clock";
import { ConflictError, ValidationError } from "../errors";
import type { Job, JobRepository } from "../jobs/ports";
import { parsePayload } from "../jobs/payload";
import { type EvidencePack, accountEvidence, disclosure } from "../ai/evidence";
import { ground } from "../ai/grounding";
import { renderPrompt } from "../ai/prompts";
import { type CallDeps, modelCall } from "./ai-call";
import type { AccountFactsSource, NewProposal, PlanItems } from "./ports";
import { CONTENT_PLAN, type PlanOutput, renderPlanContext } from "./prompts";
import type { ProposalService } from "./proposals";
import { z } from "zod";

export const PLAN_JOB = "action.plan";
export const MAX_PLAN_WEEKS = 8;
const MAX_ITEMS = 12;

const payloadSchema = z.object({
  accountId: z.string(),
  weeks: z.number().int().min(1).max(MAX_PLAN_WEEKS),
  tz: z.number().int(),
});

export interface PlanningAgentDeps extends CallDeps {
  facts: AccountFactsSource;
  planItems: PlanItems;
  proposals: ProposalService;
  jobs: JobRepository;
  resolveAccount: ResolveAccount;
}

type Common = Pick<NewProposal, "interactionId" | "basedOnDemo">;

/**
 * Agentic planning (docs/11 phase 6): the model proposes, the user decides. Its output only
 * ever becomes pending proposals; nothing in the plan changes until one is approved.
 */
export class PlanningAgent {
  constructor(private readonly deps: PlanningAgentDeps) {}

  async start(userId: string, weeks: number, tz: number): Promise<Job> {
    if (!Number.isInteger(weeks) || weeks < 1 || weeks > MAX_PLAN_WEEKS) {
      throw new ValidationError(`Plan between 1 and ${MAX_PLAN_WEEKS} weeks ahead`);
    }
    const accountId = await this.deps.resolveAccount(userId);
    if (!accountId) throw new ConflictError("Import your LinkedIn data or load the demo first");
    if (!(await this.deps.models.activeProvider(userId))) {
      throw new ConflictError("Add an OpenAI or Anthropic API key in Settings first");
    }
    const payload = { accountId, weeks, tz, label: `Content plan, ${weeks} weeks` };
    return this.deps.jobs.enqueue(
      { userId, type: PLAN_JOB, payload, maxRetries: 2 },
      nowIso(this.deps.clock),
    );
  }

  async run(job: Job): Promise<unknown> {
    const { accountId, weeks, tz } = parsePayload(payloadSchema, job.payload);
    const already = await this.deps.proposals.proposedByJob(job.id);
    if (already > 0) return { proposed: already };
    const facts = await this.deps.facts.account({ userId: job.userId, accountId }, PERIOD_DAYS, tz);
    const pack = accountEvidence(facts);
    const window = planningWindow(todayUtc(this.deps.clock()), weeks);
    const demo = facts.basedOnDemo;
    const prompt = await this.prompt(accountId, pack, window, demo);
    const summary = { ...disclosure(pack), weeks, demo };
    const { data, interactionId } = await modelCall(this.deps, job, CONTENT_PLAN, prompt, summary);
    const proposals = toProposals(data, pack, window, { interactionId, basedOnDemo: demo });
    const proposed = await this.deps.proposals.propose(accountId, proposals, job.id);
    return { summary: data.summary, proposed, basedOnDemoData: demo };
  }

  private async prompt(
    accountId: string,
    pack: EvidencePack,
    window: { from: string; to: string },
    demo: boolean,
  ): Promise<string> {
    const items = await this.deps.planItems.list(accountId);
    const existing = items.filter((p) => p.status !== "dropped" && p.status !== "published");
    return [renderPrompt(pack, { demo }), renderPlanContext({ window, existing })].join("\n\n");
  }
}

/**
 * Turns the model's plan into proposals. Citations go through `ground`, so invented evidence
 * ids are dropped; a proposal left with no real evidence, or dated outside the window, is
 * dropped entirely rather than shown as if it were grounded.
 */
export function toProposals(
  plan: PlanOutput,
  pack: EvidencePack,
  window: { from: string; to: string },
  common: Common,
): NewProposal[] {
  const items = plan.planItems
    .filter((item) => inWindow(item.plannedDate, window))
    .slice(0, MAX_ITEMS)
    .map(({ rationale, evidenceIds, ...payload }) =>
      sourced("plan_item", payload, rationale, evidenceIds, pack, common),
    );
  const experiment =
    plan.experiment && inWindow(plan.experiment.startDate, window)
      ? [experimentProposal(plan.experiment, pack, common)]
      : [];
  return [...items, ...experiment].filter((p): p is NewProposal => p !== null);
}

function experimentProposal(
  experiment: NonNullable<PlanOutput["experiment"]>,
  pack: EvidencePack,
  common: Common,
) {
  const { rationale, evidenceIds, ...payload } = experiment;
  return sourced("experiment", payload, rationale, evidenceIds, pack, common);
}

function sourced(
  kind: ProposalKind,
  payload: object,
  rationale: string,
  evidenceIds: string[],
  pack: EvidencePack,
  common: Common,
): NewProposal | null {
  const grounded = ground(evidenceIds, pack);
  if (grounded.evidence.length === 0) return null;
  return { kind, payload, origin: "ai", rationale, evidence: grounded.evidence, ...common };
}
