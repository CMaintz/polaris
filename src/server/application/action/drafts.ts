import type { ResolveAccount } from "../content/ports";
import {
  type LengthCheck,
  checkPostLength,
  isApproved,
  isOpenPublication,
} from "../../domain/drafts";
import type { AuditLog } from "../auth/ports";
import { type Clock, nowIso } from "../clock";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import type { Draft, DraftStore, DraftVersion, NewVersion } from "./draft-ports";
import type { PlanItems } from "./ports";
import type { Publication, PublicationStore } from "./publication-ports";

export interface DraftView extends Draft {
  approved: boolean;
  length: LengthCheck;
}

export interface DraftDetail {
  draft: DraftView;
  versions: DraftVersion[];
  publications: Publication[];
}

export interface DraftDeps {
  drafts: DraftStore;
  publications: PublicationStore;
  planItems: PlanItems;
  resolveAccount: ResolveAccount;
  audit: AuditLog;
  clock: Clock;
}

function viewOf(draft: Draft): DraftView {
  return { ...draft, approved: isApproved(draft), length: checkPostLength(draft.text) };
}

export class DraftService {
  constructor(private readonly deps: DraftDeps) {}

  async list(userId: string): Promise<DraftView[]> {
    const accountId = await this.deps.resolveAccount(userId);
    return accountId ? (await this.deps.drafts.list(accountId)).map(viewOf) : [];
  }

  async detail(userId: string, id: string): Promise<DraftDetail> {
    const { accountId, draft } = await this.find(userId, id);
    return {
      draft: viewOf(draft),
      versions: await this.deps.drafts.versions(accountId, id),
      publications: await this.deps.publications.forDraft(accountId, id),
    };
  }

  async create(
    userId: string,
    values: { title: string; text: string; planItemId: string | null },
  ): Promise<DraftView> {
    const accountId = await this.requireAccount(userId);
    return viewOf(await this.createIn(accountId, values, { text: values.text, origin: "user" }));
  }

  async createIn(
    accountId: string,
    values: { title: string; planItemId: string | null },
    first: NewVersion,
  ): Promise<Draft> {
    await this.assertPlanItem(accountId, values.planItemId);
    return this.deps.drafts.create(accountId, values, first, this.now());
  }

  async update(userId: string, id: string, patch: { title?: string; planItemId?: string | null }) {
    const { accountId } = await this.find(userId, id);
    await this.assertPlanItem(accountId, patch.planItemId ?? null);
    return viewOf((await this.deps.drafts.update(accountId, id, patch, this.now())) as Draft);
  }

  async save(userId: string, id: string, text: string): Promise<DraftView> {
    const { accountId } = await this.find(userId, id);
    return viewOf(await this.addVersion(accountId, id, { text, origin: "user" }));
  }

  async restore(userId: string, id: string, version: number): Promise<DraftView> {
    const { accountId } = await this.find(userId, id);
    const old = (await this.deps.drafts.versions(accountId, id)).find((v) => v.version === version);
    if (!old) throw new NotFoundError("Version");
    return viewOf(await this.addVersion(accountId, id, { text: old.text, origin: "restore" }));
  }

  /** Refuses while a publication holds the draft. */
  async addVersion(accountId: string, id: string, version: NewVersion): Promise<Draft> {
    const open = (await this.deps.publications.forDraft(accountId, id)).some((p) =>
      isOpenPublication(p.status),
    );
    if (open) throw new ConflictError("Cancel the scheduled post before editing this draft");
    const draft = await this.deps.drafts.addVersion(accountId, id, version, this.now());
    if (!draft) throw new NotFoundError("Draft");
    return draft;
  }

  async approve(userId: string, id: string): Promise<DraftView> {
    const { accountId, draft } = await this.find(userId, id);
    assertPublishable(draft.text);
    if (!(await this.deps.drafts.approve(accountId, id, draft.version, this.now()))) {
      throw new ConflictError("The draft changed while you approved it; review it again");
    }
    await this.deps.audit.record(userId, "draft.approved", { id, version: draft.version });
    return viewOf((await this.deps.drafts.get(accountId, id)) as Draft);
  }

  async byId(accountId: string, id: string): Promise<Draft | null> {
    return this.deps.drafts.get(accountId, id);
  }

  async byJob(accountId: string, jobId: string): Promise<Draft | null> {
    return this.deps.drafts.findByJob(accountId, jobId);
  }

  async remove(userId: string, id: string): Promise<void> {
    const { accountId } = await this.find(userId, id);
    await this.deps.drafts.delete(accountId, id);
  }

  async find(userId: string, id: string): Promise<{ accountId: string; draft: Draft }> {
    const accountId = await this.deps.resolveAccount(userId);
    const draft = accountId ? await this.deps.drafts.get(accountId, id) : null;
    if (!accountId || !draft) throw new NotFoundError("Draft");
    return { accountId, draft };
  }

  async requireAccount(userId: string): Promise<string> {
    const accountId = await this.deps.resolveAccount(userId);
    if (!accountId) throw new ConflictError("Import your LinkedIn data or load the demo first");
    return accountId;
  }

  private async assertPlanItem(accountId: string, planItemId: string | null): Promise<void> {
    if (planItemId && !(await this.deps.planItems.get(accountId, planItemId))) {
      throw new NotFoundError("Plan item");
    }
  }

  private now() {
    return nowIso(this.deps.clock);
  }
}

export function assertPublishable(text: string): void {
  if (!text.trim()) throw new ValidationError("The draft is empty");
  const length = checkPostLength(text);
  if (length.over) {
    throw new ValidationError(
      `The draft is ${length.length} characters; LinkedIn allows ${length.limit}`,
    );
  }
}
