import type { ResolveAccount } from "../content/ports";
import { z } from "zod";
import { isApproved } from "../../domain/drafts";
import type { AuditLog } from "../auth/ports";
import { type Clock, nowIso } from "../clock";
import { ConflictError, NotFoundError, PermanentJobError, ValidationError } from "../errors";
import type { Job, JobRepository } from "../jobs/ports";
import { parsePayload } from "../jobs/payload";
import { type DraftService, assertPublishable } from "./drafts";
import type { PlanItems } from "./ports";
import type { PublishingProvider } from "./provider-ports";
import type { Publication, PublicationStore } from "./publication-ports";
import { PublishAttempt, UNKNOWN_OUTCOME, markPlanItemPublished } from "./publish-attempt";

export const PUBLISH_JOB = "action.publish";
const DUE_BATCH = 20;

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
  private readonly attempt: PublishAttempt;

  constructor(private readonly deps: PublishingDeps) {
    this.attempt = new PublishAttempt(deps);
  }

  async schedule(userId: string, draftId: string, input: { provider: string; at: string }) {
    const { accountId, draft } = await this.deps.drafts.find(userId, draftId);
    if (!isApproved(draft)) throw new ConflictError("Approve the draft before scheduling it");
    assertPublishable(draft.text);
    const provider = await this.connectedProvider(accountId, input.provider);
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
    const { publications } = this.deps;
    const cancelled = await publications.transition(
      accountId,
      publicationId,
      from,
      "cancelled",
      {},
      this.now(),
    );
    if (!cancelled) throw new ConflictError("Only a scheduled post can be cancelled");
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
    await markPlanItemPublished(this.deps, accountId, publication.draftId, this.now());
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
      await this.attempt.fail(accountId, publicationId, UNKNOWN_OUTCOME, ["publishing"]);
      throw new PermanentJobError(UNKNOWN_OUTCOME);
    }
    if (publication.status !== "scheduled") return { status: publication.status };
    if (publication.scheduledFor > this.now()) {
      await this.deps.publications.release(publicationId);
      return { skipped: "not_due" };
    }
    return this.attempt.run(accountId, publication, this.provider(publication.provider));
  }

  private async find(userId: string, publicationId: string) {
    const accountId = await this.deps.resolveAccount(userId);
    const publication = accountId
      ? await this.deps.publications.get(accountId, publicationId)
      : null;
    if (!accountId || !publication) throw new NotFoundError("Scheduled post");
    return { accountId, publication };
  }

  private async connectedProvider(accountId: string, id: string) {
    const provider = this.provider(id);
    const status = await provider.connectionStatus(accountId);
    if (status.state !== "connected") throw new ConflictError(`Connect ${provider.label} first`);
    return provider;
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
function isLinkedInUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && /(^|\.)linkedin\.com$/.test(parsed.hostname);
  } catch {
    return false;
  }
}
