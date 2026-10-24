import type { ResolveAccount } from "../content/ports";
import { z } from "zod";
import { isApproved } from "../../domain/drafts";
import type { AuditLog } from "../auth/ports";
import { type Clock, nowIso } from "../clock";
import { ConflictError, NotFoundError, PermanentJobError, ValidationError } from "../errors";
import type { Job, JobRepository } from "../jobs/ports";
import { parsePayload } from "../jobs/payload";
import { type DraftService, assertPublishable } from "./drafts";
import {
  type PlanItems,
  type Publication,
  type PublicationStore,
  PublishError,
  type PublishingProvider,
} from "./ports";

export const PUBLISH_JOB = "action.publish";
const DUE_BATCH = 20;
const UNKNOWN_OUTCOME =
  "The connection broke while posting, so LinkedIn may or may not have published this. Check your profile, then mark it published or schedule it again.";

const payloadSchema = z.object({ accountId: z.string(), publicationId: z.string() });

export interface PublishingDeps {
  drafts: DraftService;
  publications: PublicationStore;
  providers: PublishingProvider[];
  planItems: PlanItems;
  resolveAccount: ResolveAccount;
  jobs: JobRepository;
  audit: AuditLog;
  clock: Clock;
}

/**
 * Scheduling and publishing an approved draft. Posting is at most once: a publication moves
 * to "publishing" before the provider is called, and a job that finds it already there never
 * calls the provider again, because a duplicate post is worse than one the user must confirm.
 */
export class PublishingService {
  constructor(private readonly deps: PublishingDeps) {}

  async schedule(userId: string, draftId: string, input: { provider: string; at: string }) {
    const { accountId, draft } = await this.deps.drafts.find(userId, draftId);
    if (!isApproved(draft)) throw new ConflictError("Approve the draft before scheduling it");
    assertPublishable(draft.text);
    const provider = this.provider(input.provider);
    const status = await provider.connectionStatus(accountId);
    if (status.state !== "connected") throw new ConflictError(`Connect ${provider.label} first`);
    const publication = await this.deps.publications.create(
      accountId,
      {
        draftId,
        draftVersion: draft.version,
        text: draft.text,
        provider: provider.id,
        scheduledFor: input.at,
      },
      this.now(),
    );
    await this.deps.audit.record(userId, "publication.scheduled", {
      id: publication.id,
      provider: provider.id,
      at: input.at,
    });
    return publication;
  }

  async cancel(userId: string, publicationId: string): Promise<void> {
    const { accountId } = await this.find(userId, publicationId);
    const from: Publication["status"][] = ["scheduled", "awaiting_confirmation"];
    if (
      !(await this.deps.publications.transition(
        accountId,
        publicationId,
        from,
        "cancelled",
        {},
        this.now(),
      ))
    ) {
      throw new ConflictError("Only a scheduled post can be cancelled");
    }
    await this.deps.audit.record(userId, "publication.cancelled", { id: publicationId });
  }

  async confirm(userId: string, publicationId: string, url: string | null) {
    if (url !== null && !isLinkedInUrl(url)) {
      throw new ValidationError("Paste the post's link from linkedin.com");
    }
    const { accountId, publication } = await this.find(userId, publicationId);
    const done = await this.deps.publications.transition(
      accountId,
      publicationId,
      ["awaiting_confirmation", "failed"],
      "published",
      { url, publishedAt: this.now() },
      this.now(),
    );
    if (!done) throw new ConflictError("This post is not waiting for confirmation");
    await this.markPlanItemPublished(accountId, publication.draftId);
    await this.deps.audit.record(userId, "publication.confirmed", { id: publicationId });
  }

  /**
   * Enqueues a publish job for every due publication. The job queue has no due time, so the
   * scheduler tick calls this; the claim makes a second tick skip what the first enqueued.
   */
  async enqueueDue(now: string): Promise<number> {
    const due = await this.deps.publications.dueUnclaimed(now, DUE_BATCH);
    let queued = 0;
    for (const p of due) {
      if (!(await this.deps.publications.claim(p.id, now))) continue;
      const payload = { accountId: p.accountId, publicationId: p.id, label: "Publish post" };
      await this.deps.jobs.enqueue(
        { userId: p.userId, type: PUBLISH_JOB, payload, maxRetries: 1 },
        now,
      );
      queued += 1;
    }
    return queued;
  }

  async run(job: Job): Promise<unknown> {
    const { accountId, publicationId } = parsePayload(payloadSchema, job.payload);
    const publication = await this.deps.publications.get(accountId, publicationId);
    if (!publication) return { skipped: "deleted" };
    if (publication.status === "publishing") {
      await this.fail(accountId, publicationId, UNKNOWN_OUTCOME, ["publishing"]);
      throw new PermanentJobError(UNKNOWN_OUTCOME);
    }
    if (publication.status !== "scheduled") return { status: publication.status };
    if (publication.scheduledFor > this.now()) {
      await this.deps.publications.release(publicationId);
      return { skipped: "not_due" };
    }
    await this.assertReady(accountId, publication);
    return this.publish(accountId, publication);
  }

  private async assertReady(accountId: string, publication: Publication): Promise<void> {
    const draft = await this.deps.drafts.byId(accountId, publication.draftId);
    const provider = this.provider(publication.provider);
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

  private async publish(accountId: string, publication: Publication) {
    const { publications } = this.deps;
    const now = this.now();
    if (
      !(await publications.transition(
        accountId,
        publication.id,
        ["scheduled"],
        "publishing",
        {},
        now,
      ))
    ) {
      return { skipped: "claimed" };
    }
    const provider = this.provider(publication.provider);
    try {
      return await this.complete(accountId, publication, provider);
    } catch (error) {
      const known = error instanceof PublishError && error.outcome === "not_published";
      const message = known ? error.message : UNKNOWN_OUTCOME;
      await this.fail(accountId, publication.id, message, ["publishing"]);
      throw new PermanentJobError(message);
    }
  }

  private async complete(
    accountId: string,
    publication: Publication,
    provider: PublishingProvider,
  ) {
    const { publications } = this.deps;
    const now = this.now();
    const result = await provider.publish(accountId, publication.text);
    if (provider.mode === "handoff") {
      const outcome = { url: result.url };
      await publications.transition(
        accountId,
        publication.id,
        ["publishing"],
        "awaiting_confirmation",
        outcome,
        now,
      );
      return { status: "awaiting_confirmation" };
    }
    const outcome = { ...result, publishedAt: now };
    await publications.transition(
      accountId,
      publication.id,
      ["publishing"],
      "published",
      outcome,
      now,
    );
    await this.markPlanItemPublished(accountId, publication.draftId);
    return { status: "published", ...result };
  }

  private async fail(accountId: string, id: string, error: string, from: Publication["status"][]) {
    await this.deps.publications.transition(accountId, id, from, "failed", { error }, this.now());
  }

  private async markPlanItemPublished(accountId: string, draftId: string): Promise<void> {
    const draft = await this.deps.drafts.byId(accountId, draftId);
    if (draft?.planItemId) {
      await this.deps.planItems.update(
        accountId,
        draft.planItemId,
        { status: "published" },
        this.now(),
      );
    }
  }

  private async find(userId: string, publicationId: string) {
    const accountId = await this.deps.resolveAccount(userId);
    const publication = accountId
      ? await this.deps.publications.get(accountId, publicationId)
      : null;
    if (!accountId || !publication) throw new NotFoundError("Scheduled post");
    return { accountId, publication };
  }

  private provider(id: string): PublishingProvider {
    const provider = this.deps.providers.find((p) => p.id === id);
    if (!provider) throw new ValidationError(`Unknown publishing provider: ${id}`);
    return provider;
  }

  private now() {
    return nowIso(this.deps.clock);
  }
}

/** Only links to LinkedIn itself are stored, so a pasted javascript: URL can never render. */
export function isLinkedInUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && /(^|\.)linkedin\.com$/.test(parsed.hostname);
  } catch {
    return false;
  }
}
