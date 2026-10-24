import { randomUUID } from "node:crypto";
import type {
  Draft,
  DraftStore,
  DraftVersion,
  NewProposal,
  NewVersion,
  Proposal,
  ProposalStore,
} from "../../application/action/ports";
import type { EvidenceItem } from "../../domain/insights";
import type { ProposalStatus } from "../../domain/proposals";
import { type Db, fromJson, toJson } from "./database";

type Row = Record<string, unknown>;

const DRAFT_SELECT = `SELECT d.*, v.text FROM drafts d
  JOIN draft_versions v ON v.draft_id = d.id AND v.version = d.version`;

const toDraft = (r: Row): Draft => ({
  id: r["id"] as string,
  planItemId: r["plan_item_id"] as string | null,
  title: r["title"] as string,
  version: r["version"] as number,
  text: r["text"] as string,
  approvedVersion: r["approved_version"] as number | null,
  approvedAt: r["approved_at"] as string | null,
  createdAt: r["created_at"] as string,
  updatedAt: r["updated_at"] as string,
});

const toVersion = (r: Row): DraftVersion => ({
  version: r["version"] as number,
  text: r["text"] as string,
  origin: r["origin"] as DraftVersion["origin"],
  notes: r["notes"] as string,
  interactionId: r["interaction_id"] as string | null,
  basedOnDemo: r["based_on_demo"] === 1,
  createdAt: r["created_at"] as string,
});

export class SqliteDraftStore implements DraftStore {
  constructor(private readonly db: Db) {}

  async list(accountId: string) {
    const rows = this.db
      .prepare(`${DRAFT_SELECT} WHERE d.account_id = ? ORDER BY d.updated_at DESC, d.rowid`)
      .all(accountId) as Row[];
    return rows.map(toDraft);
  }

  async get(accountId: string, id: string) {
    const row = this.db
      .prepare(`${DRAFT_SELECT} WHERE d.account_id = ? AND d.id = ?`)
      .get(accountId, id) as Row | undefined;
    return row ? toDraft(row) : null;
  }

  async versions(accountId: string, id: string) {
    const rows = this.db
      .prepare(
        `SELECT v.* FROM draft_versions v JOIN drafts d ON d.id = v.draft_id
         WHERE d.account_id = ? AND d.id = ? ORDER BY v.version DESC`,
      )
      .all(accountId, id) as Row[];
    return rows.map(toVersion);
  }

  async findByJob(accountId: string, jobId: string) {
    const row = this.db
      .prepare("SELECT draft_id FROM draft_versions WHERE job_id = ?")
      .get(jobId) as { draft_id: string } | undefined;
    return row ? this.get(accountId, row.draft_id) : null;
  }

  async create(
    accountId: string,
    values: { title: string; planItemId: string | null },
    first: NewVersion,
    now: string,
  ) {
    const id = randomUUID();
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO drafts (id, account_id, plan_item_id, title, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, ?)`,
        )
        .run(id, accountId, values.planItemId, values.title, now, now);
      this.insertVersion(id, 1, first, now);
    })();
    return (await this.get(accountId, id)) as Draft;
  }

  async update(
    accountId: string,
    id: string,
    patch: { title?: string; planItemId?: string | null },
    now: string,
  ) {
    const current = await this.get(accountId, id);
    if (!current) return null;
    this.db
      .prepare("UPDATE drafts SET title = ?, plan_item_id = ?, updated_at = ? WHERE id = ?")
      .run(
        patch.title ?? current.title,
        patch.planItemId === undefined ? current.planItemId : patch.planItemId,
        now,
        id,
      );
    return this.get(accountId, id);
  }

  async addVersion(accountId: string, id: string, version: NewVersion, now: string) {
    const added = this.db.transaction(() => {
      const bumped = this.db
        .prepare(
          `UPDATE drafts SET version = version + 1, approved_version = NULL, approved_at = NULL,
             updated_at = ? WHERE account_id = ? AND id = ? RETURNING version`,
        )
        .get(now, accountId, id) as { version: number } | undefined;
      if (bumped) this.insertVersion(id, bumped.version, version, now);
      return bumped !== undefined;
    })();
    return added ? this.get(accountId, id) : null;
  }

  async approve(accountId: string, id: string, version: number, now: string) {
    return (
      this.db
        .prepare(
          `UPDATE drafts SET approved_version = version, approved_at = ?
           WHERE account_id = ? AND id = ? AND version = ?`,
        )
        .run(now, accountId, id, version).changes === 1
    );
  }

  async delete(accountId: string, id: string) {
    return (
      this.db.prepare("DELETE FROM drafts WHERE account_id = ? AND id = ?").run(accountId, id)
        .changes === 1
    );
  }

  private insertVersion(draftId: string, version: number, v: NewVersion, now: string) {
    this.db
      .prepare(
        `INSERT INTO draft_versions (draft_id, version, text, origin, notes, interaction_id,
           based_on_demo, job_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        draftId,
        version,
        v.text,
        v.origin,
        v.notes ?? "",
        v.interactionId ?? null,
        v.basedOnDemo ? 1 : 0,
        v.jobId ?? null,
        now,
      );
  }
}

const toProposal = (r: Row): Proposal => ({
  id: r["id"] as string,
  kind: r["kind"] as Proposal["kind"],
  payload: fromJson(r["payload"] as string),
  origin: r["origin"] as Proposal["origin"],
  rationale: r["rationale"] as string,
  evidence: fromJson<EvidenceItem[]>(r["evidence"] as string) ?? [],
  status: r["status"] as ProposalStatus,
  decidedBy: r["decided_by"] as string | null,
  decidedAt: r["decided_at"] as string | null,
  appliedRecordId: r["applied_record_id"] as string | null,
  error: r["error"] as string | null,
  interactionId: r["interaction_id"] as string | null,
  basedOnDemo: r["based_on_demo"] === 1,
  createdAt: r["created_at"] as string,
});

export class SqliteProposalStore implements ProposalStore {
  constructor(private readonly db: Db) {}

  async createMany(accountId: string, proposals: NewProposal[], jobId: string | null, now: string) {
    const insert = this.db.prepare(
      `INSERT INTO proposals (id, account_id, kind, payload, origin, rationale, evidence, status,
         interaction_id, based_on_demo, job_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
    );
    this.db.transaction(() => {
      for (const p of proposals) {
        insert.run(
          randomUUID(),
          accountId,
          p.kind,
          toJson(p.payload),
          p.origin,
          p.rationale,
          toJson(p.evidence),
          p.interactionId,
          p.basedOnDemo ? 1 : 0,
          jobId,
          now,
        );
      }
    })();
  }

  async countForJob(jobId: string) {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM proposals WHERE job_id = ?")
      .get(jobId) as { n: number };
    return row.n;
  }

  async list(accountId: string, status?: ProposalStatus) {
    const rows = this.db
      .prepare(
        `SELECT * FROM proposals WHERE account_id = ? AND (? IS NULL OR status = ?)
         ORDER BY created_at DESC, rowid`,
      )
      .all(accountId, status ?? null, status ?? null) as Row[];
    return rows.map(toProposal);
  }

  async get(accountId: string, id: string) {
    const row = this.db
      .prepare("SELECT * FROM proposals WHERE account_id = ? AND id = ?")
      .get(accountId, id) as Row | undefined;
    return row ? toProposal(row) : null;
  }

  async decide(
    accountId: string,
    id: string,
    status: "approved" | "rejected",
    userId: string,
    now: string,
  ) {
    return (
      this.db
        .prepare(
          `UPDATE proposals SET status = ?, decided_by = ?, decided_at = ?, error = NULL
           WHERE account_id = ? AND id = ? AND status IN ('pending', 'failed')`,
        )
        .run(status, userId, now, accountId, id).changes === 1
    );
  }

  async finish(
    accountId: string,
    id: string,
    outcome: { status: "applied"; recordId: string } | { status: "failed"; error: string },
  ) {
    const recordId = outcome.status === "applied" ? outcome.recordId : null;
    const error = outcome.status === "failed" ? outcome.error : null;
    this.db
      .prepare(
        `UPDATE proposals SET status = ?, applied_record_id = ?, error = ?
         WHERE account_id = ? AND id = ? AND status = 'approved'`,
      )
      .run(outcome.status, recordId, error, accountId, id);
  }
}
