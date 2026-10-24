import type { NewRecord, RecordStore } from "../../application/planning/ports";
import type {
  Campaign,
  CampaignLinkStore,
  CampaignLinks,
  LinkTargets,
  Pillar,
} from "../../application/strategy/ports";
import { type Db, fromJson, toJson } from "./database";
import { SqliteRecordTable } from "./record-table";

export function campaignTable(db: Db): RecordStore<Campaign> {
  return new SqliteRecordTable<Campaign>(
    db,
    "campaigns",
    ["name", "objective", "startDate", "endDate", "status", "notes"],
    "start_date DESC, created_at",
  );
}

type PillarRow = Omit<Pillar, "topics"> & { topics: string };

const toRow = <T extends { topics?: string[] }>(values: T) =>
  ("topics" in values ? { ...values, topics: toJson(values.topics) } : values) as never;

const fromRow = (row: PillarRow | null): Pillar | null =>
  row && { ...row, topics: fromJson<string[]>(row.topics) ?? [] };

export class SqlitePillarStore implements RecordStore<Pillar> {
  private readonly table: SqliteRecordTable<PillarRow>;

  constructor(db: Db) {
    this.table = new SqliteRecordTable<PillarRow>(
      db,
      "content_pillars",
      ["name", "description", "topics", "targetShare"],
      "target_share DESC, created_at",
    );
  }

  async list(accountId: string): Promise<Pillar[]> {
    return (await this.table.list(accountId)).map((row) => fromRow(row) as Pillar);
  }

  async get(accountId: string, id: string): Promise<Pillar | null> {
    return fromRow(await this.table.get(accountId, id));
  }

  async create(accountId: string, values: NewRecord<Pillar>, now: string): Promise<Pillar> {
    return fromRow(await this.table.create(accountId, toRow(values), now)) as Pillar;
  }

  async update(accountId: string, id: string, patch: Partial<NewRecord<Pillar>>, now: string) {
    return fromRow(await this.table.update(accountId, id, toRow(patch), now));
  }

  async delete(accountId: string, id: string): Promise<boolean> {
    return this.table.delete(accountId, id);
  }
}

// Fixed table and column names, never from input, so interpolating them is safe.
const LINKS = [
  { key: "postIds", table: "campaign_posts", column: "post_id" },
  { key: "planItemIds", table: "campaign_plan_items", column: "plan_item_id" },
  { key: "goalIds", table: "campaign_goals", column: "goal_id" },
] as const;

export class SqliteCampaignLinkStore implements CampaignLinkStore {
  constructor(private readonly db: Db) {}

  async links(campaignId: string): Promise<CampaignLinks> {
    const read = (table: string, column: string) =>
      (
        this.db
          .prepare(`SELECT ${column} AS id FROM ${table} WHERE campaign_id = ? ORDER BY rowid`)
          .all(campaignId) as { id: string }[]
      ).map((r) => r.id);
    const entries = LINKS.map(({ key, table, column }) => [key, read(table, column)]);
    return Object.fromEntries(entries) as CampaignLinks;
  }

  async replace(campaignId: string, links: CampaignLinks): Promise<void> {
    this.db.transaction(() => {
      for (const { key, table, column } of LINKS) {
        this.db.prepare(`DELETE FROM ${table} WHERE campaign_id = ?`).run(campaignId);
        const insert = this.db.prepare(
          `INSERT OR IGNORE INTO ${table} (campaign_id, ${column}) VALUES (?, ?)`,
        );
        for (const id of links[key]) insert.run(campaignId, id);
      }
    })();
  }
}

export class SqliteLinkTargets implements LinkTargets {
  constructor(private readonly db: Db) {}

  private owns(table: string, accountId: string, id: string): boolean {
    return (
      this.db
        .prepare(`SELECT 1 FROM ${table} WHERE account_id = ? AND id = ?`)
        .get(accountId, id) !== undefined
    );
  }

  async hasPost(accountId: string, postId: string) {
    return this.owns("posts", accountId, postId);
  }

  async hasPlanItem(accountId: string, planItemId: string) {
    return this.owns("plan_items", accountId, planItemId);
  }

  async hasGoal(accountId: string, goalId: string) {
    return this.owns("goals", accountId, goalId);
  }

  async planItemPostIds(accountId: string, planItemIds: readonly string[]): Promise<string[]> {
    if (planItemIds.length === 0) return [];
    const rows = this.db
      .prepare(
        `SELECT post_id FROM plan_items WHERE account_id = ? AND post_id IS NOT NULL
         AND id IN (SELECT value FROM json_each(?))`,
      )
      .all(accountId, JSON.stringify(planItemIds)) as { post_id: string }[];
    return rows.map((r) => r.post_id);
  }
}
