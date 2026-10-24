import type { DigestStore, StoredDigest } from "../../application/intelligence/feed-ports";
import type {
  PendingReport,
  ReportStore,
  StoredReport,
} from "../../application/intelligence/research-ports";
import type { ResearchReportBody } from "../../../shared/intelligence-types";
import { type Db, fromJson, toJson } from "../db/database";

interface ReportRow {
  id: string;
  account_id: string;
  question: string;
  peer_id: string | null;
  peer_name: string | null;
  body: string | null;
  created_at: string;
  completed_at: string | null;
  job_status: string | null;
  job_error: string | null;
}

// The report's id is its job's id, so the job's status and error come straight from there.
const REPORT_SELECT = `SELECT r.*, j.status AS job_status, j.error AS job_error
  FROM research_reports r LEFT JOIN jobs j ON j.id = r.id`;

function toReport(row: ReportRow): StoredReport {
  return {
    id: row.id,
    accountId: row.account_id,
    question: row.question,
    peerId: row.peer_id,
    peerName: row.peer_name,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    body: fromJson<ResearchReportBody>(row.body),
    jobStatus: row.job_status,
    jobError: row.job_error,
  };
}

export class SqliteReportStore implements ReportStore {
  constructor(private readonly db: Db) {}

  async ensure(report: PendingReport): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO research_reports (id, account_id, question, peer_id, peer_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
      )
      .run(
        report.id,
        report.accountId,
        report.question,
        report.peerId,
        report.peerName,
        report.createdAt,
      );
  }

  async complete(id: string, body: ResearchReportBody, now: string): Promise<void> {
    this.db
      .prepare("UPDATE research_reports SET body = ?, completed_at = ? WHERE id = ?")
      .run(toJson(body), now, id);
  }

  async get(accountId: string, id: string): Promise<StoredReport | null> {
    const row = this.db
      .prepare(`${REPORT_SELECT} WHERE r.account_id = ? AND r.id = ?`)
      .get(accountId, id) as ReportRow | undefined;
    return row ? toReport(row) : null;
  }

  async list(accountId: string, limit: number): Promise<StoredReport[]> {
    const rows = this.db
      .prepare(`${REPORT_SELECT} WHERE r.account_id = ? ORDER BY r.created_at DESC LIMIT ?`)
      .all(accountId, limit) as ReportRow[];
    return rows.map(toReport);
  }
}

interface DigestRow {
  id: string;
  period_from: string;
  period_to: string;
  matches: string;
  ai: string;
  created_at: string;
}

export class SqliteDigestStore implements DigestStore {
  constructor(private readonly db: Db) {}

  async save(accountId: string, digest: StoredDigest): Promise<void> {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO trend_digests (id, account_id, period_from, period_to, matches, ai, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        digest.id,
        accountId,
        digest.from,
        digest.to,
        toJson(digest.matches),
        toJson(digest.ai),
        digest.createdAt,
      );
  }

  async list(accountId: string, limit: number): Promise<StoredDigest[]> {
    const rows = this.db
      .prepare("SELECT * FROM trend_digests WHERE account_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(accountId, limit) as DigestRow[];
    return rows.map((row) => ({
      id: row.id,
      from: row.period_from,
      to: row.period_to,
      matches: fromJson(row.matches) ?? [],
      ai: fromJson(row.ai) ?? { status: "skipped", reason: "Not recorded" },
      createdAt: row.created_at,
    }));
  }
}
