import { randomUUID } from "node:crypto";
import type { NewProposal, Proposal, ProposalStore } from "../../application/action/proposal-ports";
import type { EvidenceItem } from "../../domain/insight-types";
import type { ProposalStatus } from "../../domain/proposals";
import { type Db, fromJson, toJson } from "./database";

type Row = Record<string, unknown>;

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

const INSERT_PROPOSAL = `INSERT INTO proposals (id, account_id, kind, payload, origin, rationale,
    evidence, status, interaction_id, based_on_demo, job_id, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`;

const proposalValues = (accountId: string, p: NewProposal, jobId: string | null, now: string) => [
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
];

export class SqliteProposalStore implements ProposalStore {
  constructor(private readonly db: Db) {}

  async createMany(accountId: string, proposals: NewProposal[], jobId: string | null, now: string) {
    const insert = this.db.prepare(INSERT_PROPOSAL);
    this.db.transaction(() => {
      for (const p of proposals) insert.run(...proposalValues(accountId, p, jobId, now));
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
    // A failed apply may be decided again (its cause may be fixed); a rejected or applied
    // proposal is final, which keeps a rejected proposal from ever changing data.
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
