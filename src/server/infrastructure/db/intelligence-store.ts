import { randomUUID } from "node:crypto";
import type {
  Feed,
  FeedStore,
  ParsedFeedItem,
  StoredFeedItem,
} from "../../application/intelligence/feed-ports";
import type { Db } from "./database";

interface FeedRow {
  id: string;
  url: string;
  title: string | null;
  last_fetched_at: string | null;
  last_status: "ok" | "error" | null;
  last_error: string | null;
  created_at: string;
  item_count: number;
}

const FEED_SELECT = `SELECT f.*, (SELECT COUNT(*) FROM feed_items i WHERE i.feed_id = f.id) AS item_count
  FROM feeds f`;

function toFeed(row: FeedRow): Feed {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    lastFetchedAt: row.last_fetched_at,
    lastStatus: row.last_status,
    lastError: row.last_error,
    itemCount: row.item_count,
    createdAt: row.created_at,
  };
}

interface ItemRow {
  id: string;
  feed_id: string;
  feed_title: string | null;
  title: string;
  summary: string;
  link: string | null;
  published_at: string | null;
  fetched_at: string;
}

function toItem(row: ItemRow): StoredFeedItem {
  return {
    id: row.id,
    feedId: row.feed_id,
    feedTitle: row.feed_title,
    title: row.title,
    summary: row.summary,
    link: row.link,
    publishedAt: row.published_at,
    fetchedAt: row.fetched_at,
  };
}

export class SqliteFeedStore implements FeedStore {
  constructor(private readonly db: Db) {}

  async list(accountId: string): Promise<Feed[]> {
    const rows = this.db
      .prepare(`${FEED_SELECT} WHERE f.account_id = ? ORDER BY f.created_at`)
      .all(accountId) as FeedRow[];
    return rows.map(toFeed);
  }

  async get(accountId: string, id: string): Promise<Feed | null> {
    const row = this.db
      .prepare(`${FEED_SELECT} WHERE f.account_id = ? AND f.id = ?`)
      .get(accountId, id) as FeedRow | undefined;
    return row ? toFeed(row) : null;
  }

  async create(accountId: string, url: string, now: string): Promise<Feed | null> {
    const id = randomUUID();
    const inserted = this.db
      .prepare(
        `INSERT INTO feeds (id, account_id, url, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (account_id, url) DO NOTHING`,
      )
      .run(id, accountId, url, now);
    return inserted.changes === 1 ? this.get(accountId, id) : null;
  }

  async delete(accountId: string, id: string): Promise<boolean> {
    return (
      this.db.prepare("DELETE FROM feeds WHERE account_id = ? AND id = ?").run(accountId, id)
        .changes === 1
    );
  }

  async addItems(
    feedId: string,
    items: (ParsedFeedItem & { key: string })[],
    now: string,
  ): Promise<number> {
    const insert = this.db.prepare(
      `INSERT INTO feed_items (id, feed_id, dedupe_key, title, summary, link, published_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (feed_id, dedupe_key) DO NOTHING`,
    );
    const write = this.db.transaction(() =>
      items.reduce(
        (added, item) =>
          added +
          insert.run(
            randomUUID(),
            feedId,
            item.key,
            item.title,
            item.summary,
            item.link,
            item.publishedAt,
            now,
          ).changes,
        0,
      ),
    );
    return write();
  }

  async recordFetch(
    feedId: string,
    result: { title: string | null; error: string | null },
    now: string,
  ): Promise<void> {
    // A failed fetch keeps the title from the last good one.
    this.db
      .prepare(
        `UPDATE feeds SET last_fetched_at = ?, last_status = ?, last_error = ?,
           title = COALESCE(?, title) WHERE id = ?`,
      )
      .run(now, result.error ? "error" : "ok", result.error, result.title, feedId);
  }

  async items(accountId: string, since: string): Promise<StoredFeedItem[]> {
    const rows = this.db
      .prepare(
        `SELECT i.*, f.title AS feed_title FROM feed_items i JOIN feeds f ON f.id = i.feed_id
         WHERE f.account_id = ? AND i.fetched_at >= ?
         ORDER BY COALESCE(i.published_at, i.fetched_at) DESC`,
      )
      .all(accountId, since) as ItemRow[];
    return rows.map(toItem);
  }

  async firstFetch(accountId: string): Promise<string | null> {
    const row = this.db
      .prepare(
        `SELECT MIN(i.fetched_at) AS first FROM feed_items i JOIN feeds f ON f.id = i.feed_id
         WHERE f.account_id = ?`,
      )
      .get(accountId) as { first: string | null };
    return row.first;
  }

  async pruneBefore(accountId: string, before: string): Promise<void> {
    this.db
      .prepare(
        `DELETE FROM feed_items WHERE fetched_at < ?
         AND feed_id IN (SELECT id FROM feeds WHERE account_id = ?)`,
      )
      .run(before, accountId);
  }
}
