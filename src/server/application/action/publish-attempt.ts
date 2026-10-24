import { type Clock, nowIso } from "../clock";
import { PermanentJobError } from "../errors";
import type { DraftService } from "./drafts";
import type { PlanItems } from "./ports";
import { PublishError, type PublishingProvider } from "./provider-ports";
import type { Publication, PublicationOutcome, PublicationStore } from "./publication-ports";

export const UNKNOWN_OUTCOME =
  "The connection broke while posting, so LinkedIn may or may not have published this. Check your profile, then mark it published or schedule it again.";

export interface AttemptDeps {
  drafts: DraftService;
  publications: PublicationStore;
  planItems: PlanItems;
  clock: Clock;
}

interface Step {
  from: Publication["status"][];
  to: Publication["status"];
  outcome?: PublicationOutcome;
}

/**
 * One provider call for a due publication, and the status it leaves behind. The publication
 * moves to "publishing" before the call, so a crash mid-call is never retried as a post.
 */
export class PublishAttempt {
  constructor(private readonly deps: AttemptDeps) {}

  async run(accountId: string, publication: Publication, provider: PublishingProvider) {
    await this.assertReady(accountId, publication, provider);
    const step: Step = { from: ["scheduled"], to: "publishing" };
    if (!(await this.moveTo(accountId, publication.id, step))) return { skipped: "claimed" };
    try {
      return await this.complete(accountId, publication, provider);
    } catch (error) {
      const known = error instanceof PublishError && error.outcome === "not_published";
      const message = known ? error.message : UNKNOWN_OUTCOME;
      await this.fail(accountId, publication.id, message, ["publishing"]);
      throw new PermanentJobError(message);
    }
  }

  async fail(accountId: string, id: string, error: string, from: Publication["status"][]) {
    await this.moveTo(accountId, id, { from, to: "failed", outcome: { error } });
  }

  private async assertReady(
    accountId: string,
    publication: Publication,
    provider: PublishingProvider,
  ): Promise<void> {
    const draft = await this.deps.drafts.byId(accountId, publication.draftId);
    let problem: string | null = null;
    if (!draft || draft.approvedVersion !== publication.draftVersion) {
      problem = "The draft is no longer approved";
    } else if ((await provider.connectionStatus(accountId)).state !== "connected") {
      problem = `${provider.label} is not connected; reconnect it and schedule again`;
    }
    if (problem === null) return;
    await this.fail(accountId, publication.id, problem, ["scheduled"]);
    throw new PermanentJobError(problem);
  }

  private async complete(
    accountId: string,
    publication: Publication,
    provider: PublishingProvider,
  ) {
    const now = this.now();
    const result = await provider.publish(accountId, publication.text);
    if (provider.mode === "handoff") {
      const outcome = { url: result.url };
      await this.moveTo(
        accountId,
        publication.id,
        { from: ["publishing"], to: "awaiting_confirmation", outcome },
        now,
      );
      return { status: "awaiting_confirmation" };
    }
    const outcome = { ...result, publishedAt: now };
    await this.moveTo(
      accountId,
      publication.id,
      { from: ["publishing"], to: "published", outcome },
      now,
    );
    await markPlanItemPublished(this.deps, accountId, publication.draftId, this.now());
    return { status: "published", ...result };
  }

  private moveTo(accountId: string, id: string, step: Step, now = this.now()) {
    const { from, to, outcome = {} } = step;
    return this.deps.publications.transition(accountId, id, from, to, outcome, now);
  }

  private now() {
    return nowIso(this.deps.clock);
  }
}

export async function markPlanItemPublished(
  deps: Pick<AttemptDeps, "drafts" | "planItems">,
  accountId: string,
  draftId: string,
  now: string,
): Promise<void> {
  const draft = await deps.drafts.byId(accountId, draftId);
  if (draft?.planItemId) {
    await deps.planItems.update(accountId, draft.planItemId, { status: "published" }, now);
  }
}
