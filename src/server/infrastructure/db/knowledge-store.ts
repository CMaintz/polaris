import { createHash } from "node:crypto";
import {
  type HitDetails,
  type KeywordIndex,
  type LexicalHit,
  SNIPPET_MARK,
  type SearchFilters,
  type TermMode,
} from "../../application/knowledge/ports";
import { displayText } from "../../domain/content";
import { type Db, fromJson } from "./database";

const MARKS = new RegExp(`[${SNIPPET_MARK.open}${SNIPPET_MARK.close}]`, "g");
const MARKED_TERM = new RegExp(
  `${SNIPPET_MARK.open}([^${SNIPPET_MARK.close}]*)${SNIPPET_MARK.close}`,
  "g",
);
const EXCERPT_LENGTH = 240;
const SNIPPET_TOKENS = 28;

/** Readable text with the snippet markers removed, so stored text can never forge a match. */
function readable(text: string | null): string {
  return (displayText(text) ?? "").replace(MARKS, "").trim();
}

// Each filter is a fixed fragment with a nullable parameter, so request input only ever
// arrives as a bound value.
const FILTERS = `
  AND (@contentType IS NULL OR p.content_type = @contentType)
  AND (@from IS NULL OR substr(p.published_at, 1, 10) >= @from)
  AND (@to IS NULL OR substr(p.published_at, 1, 10) <= @to)
  AND (@topic IS NULL OR EXISTS (SELECT 1 FROM post_topics pt JOIN topics t ON t.id = pt.topic_id
    WHERE pt.post_id = p.id AND t.name = @topic))
  AND (@theme IS NULL OR EXISTS (SELECT 1 FROM post_themes ph JOIN themes th ON th.id = ph.theme_id
    WHERE ph.post_id = p.id AND th.name = @theme))`;

const filterParams = (f: SearchFilters) => ({
  contentType: f.contentType ?? null,
  from: f.from ?? null,
  to: f.to ?? null,
  topic: f.topic?.toLowerCase() ?? null,
  theme: f.theme ?? null,
});

// bm25 weights: a hashtag hit counts double a body hit, since a tag states the subject.
const SEARCH = `
  SELECT d.post_id AS postId,
    snippet(post_search, 0, @open, @close, '...', ${SNIPPET_TOKENS}) AS body,
    highlight(post_search, 1, @open, @close) AS topics
  FROM post_search
  JOIN knowledge_documents d ON d.doc_id = post_search.rowid
  JOIN posts p ON p.id = d.post_id
  WHERE post_search MATCH @match AND d.account_id = @accountId AND p.account_id = @accountId
  ${FILTERS}
  ORDER BY bm25(post_search, 1.0, 2.0) LIMIT @limit`;

const TOPIC_NAMES = `(SELECT group_concat(t.name, ' ') FROM post_topics pt
  JOIN topics t ON t.id = pt.topic_id WHERE pt.post_id = p.id)`;

/** Quoted prefix terms: inside quotes, AND, OR, NOT, NEAR and * are words, not operators. */
function matchExpression(terms: string[], mode: TermMode): string {
  return terms.map((t) => `"${t.replace(/"/g, '""')}"*`).join(mode === "all" ? " " : " OR ");
}

function markedTerms(...texts: string[]): string[] {
  const found = texts.flatMap((t) =>
    [...t.matchAll(MARKED_TERM)].map((m) => (m[1] ?? "").toLowerCase()),
  );
  return [...new Set(found)];
}

interface SourceRow {
  id: string;
  text: string | null;
  topics: string | null;
}

export class SqliteKeywordIndex implements KeywordIndex {
  constructor(private readonly db: Db) {}

  async sync(accountId: string, now: string): Promise<number> {
    const rows = this.db
      .prepare(`SELECT p.id, p.text, ${TOPIC_NAMES} AS topics FROM posts p WHERE p.account_id = ?`)
      .all(accountId) as SourceRow[];
    const hashes = new Map(
      (
        this.db
          .prepare("SELECT post_id, search_hash FROM knowledge_documents WHERE account_id = ?")
          .all(accountId) as { post_id: string; search_hash: string }[]
      ).map((r) => [r.post_id, r.search_hash]),
    );
    return this.db.transaction(() => {
      let changed = 0;
      for (const row of rows) {
        if (this.syncPost(accountId, row, hashes.get(row.id), now)) changed += 1;
      }
      return changed;
    })();
  }

  private syncPost(accountId: string, row: SourceRow, stored: string | undefined, now: string) {
    const body = readable(row.text);
    const topics = row.topics ?? "";
    if (!body) {
      if (stored === undefined) return false;
      this.db.prepare("DELETE FROM knowledge_documents WHERE post_id = ?").run(row.id);
      return true;
    }
    const hash = createHash("sha256").update(`${body}\n${topics}`).digest("hex");
    if (hash === stored) return false;
    this.db.prepare("DELETE FROM knowledge_documents WHERE post_id = ?").run(row.id);
    const { lastInsertRowid } = this.db
      .prepare(
        "INSERT INTO knowledge_documents (post_id, account_id, search_hash, indexed_at) VALUES (?, ?, ?, ?)",
      )
      .run(row.id, accountId, hash, now);
    this.db
      .prepare("INSERT INTO post_search (rowid, body, topics) VALUES (?, ?, ?)")
      .run(lastInsertRowid, body, topics);
    return true;
  }

  async search(
    accountId: string,
    terms: string[],
    mode: TermMode,
    filters: SearchFilters,
    limit: number,
  ): Promise<LexicalHit[]> {
    if (terms.length === 0) return [];
    const rows = this.db.prepare(SEARCH).all({
      ...filterParams(filters),
      ...SNIPPET_MARK,
      match: matchExpression(terms, mode),
      accountId,
      limit,
    }) as { postId: string; body: string; topics: string }[];
    return rows.map((r) => ({
      postId: r.postId,
      marked: r.body,
      matchedTerms: markedTerms(r.body, r.topics),
    }));
  }

  async documents(accountId: string) {
    const rows = this.db
      .prepare("SELECT id, text FROM posts WHERE account_id = ? AND text IS NOT NULL ORDER BY id")
      .all(accountId) as { id: string; text: string }[];
    return rows.flatMap((r) => {
      const text = readable(r.text);
      return text ? [{ postId: r.id, text }] : [];
    });
  }

  async filteredIds(accountId: string, filters: SearchFilters): Promise<Set<string> | null> {
    const params = filterParams(filters);
    if (Object.values(params).every((v) => v === null)) return null;
    const rows = this.db
      .prepare(`SELECT p.id FROM posts p WHERE p.account_id = @accountId ${FILTERS}`)
      .all({ ...params, accountId }) as { id: string }[];
    return new Set(rows.map((r) => r.id));
  }

  async details(accountId: string, postIds: string[]): Promise<HitDetails[]> {
    const rows = this.db
      .prepare(
        `SELECT p.id, p.published_at, p.time_known, p.content_type, p.text,
           (SELECT json_group_array(t.name) FROM post_topics pt JOIN topics t ON t.id = pt.topic_id
            WHERE pt.post_id = p.id) AS topics,
           (SELECT json_group_array(th.name) FROM post_themes ph JOIN themes th ON th.id = ph.theme_id
            WHERE ph.post_id = p.id) AS themes
         FROM posts p WHERE p.account_id = ? AND p.id IN (SELECT value FROM json_each(?))`,
      )
      .all(accountId, JSON.stringify(postIds)) as Record<string, string | number | null>[];
    return rows.map((r) => ({
      postId: r["id"] as string,
      publishedAt: r["published_at"] as string | null,
      timeKnown: r["time_known"] === 1,
      contentType: r["content_type"] as string,
      topics: (fromJson<string[]>(r["topics"] as string) ?? []).sort(),
      themes: (fromJson<string[]>(r["themes"] as string) ?? []).sort(),
      excerpt: readable(r["text"] as string | null).slice(0, EXCERPT_LENGTH),
    }));
  }

  async indexedCount(accountId: string): Promise<number> {
    const row = this.db
      .prepare("SELECT count(*) AS n FROM knowledge_documents WHERE account_id = ?")
      .get(accountId) as { n: number };
    return row.n;
  }

  async ownerOf(accountId: string): Promise<string | null> {
    const row = this.db.prepare("SELECT user_id FROM accounts WHERE id = ?").get(accountId) as
      { user_id: string } | undefined;
    return row?.user_id ?? null;
  }
}
