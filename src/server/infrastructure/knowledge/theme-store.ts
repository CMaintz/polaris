import { randomUUID } from "node:crypto";
import type { ThemeRun, ThemeStore } from "../../application/knowledge/ports";
import type { Theme } from "../../domain/themes";
import { type Db, fromJson, toJson } from "../db/database";

interface RunRow {
  interaction_id: string | null;
  provider: string;
  model: string;
  prompt_version: string;
  classified_post_ids: string;
  posts_available: number;
  based_on_demo: number;
  created_at: string;
}

const toRun = (row: RunRow): ThemeRun => ({
  interactionId: row.interaction_id,
  provider: row.provider,
  model: row.model,
  promptVersion: row.prompt_version,
  classifiedPostIds: fromJson<string[]>(row.classified_post_ids) ?? [],
  postsAvailable: row.posts_available,
  basedOnDemo: row.based_on_demo === 1,
  createdAt: row.created_at,
});

export class SqliteThemeStore implements ThemeStore {
  constructor(private readonly db: Db) {}

  async replace(accountId: string, run: ThemeRun, themes: Theme[]): Promise<void> {
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM themes WHERE account_id = ?").run(accountId);
      this.db
        .prepare(
          `INSERT OR REPLACE INTO theme_runs (account_id, interaction_id, provider, model,
             prompt_version, classified_post_ids, posts_available, based_on_demo, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          accountId,
          run.interactionId,
          run.provider,
          run.model,
          run.promptVersion,
          toJson(run.classifiedPostIds),
          run.postsAvailable,
          run.basedOnDemo ? 1 : 0,
          run.createdAt,
        );
      for (const theme of themes) this.insertTheme(accountId, theme);
    })();
  }

  /** The SELECT re-checks ownership: a post id from another account inserts nothing. */
  private insertTheme(accountId: string, theme: Theme) {
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO themes (id, account_id, name, description) VALUES (?, ?, ?, ?)")
      .run(id, accountId, theme.name, theme.description);
    const link = this.db.prepare(
      `INSERT OR IGNORE INTO post_themes (post_id, theme_id)
       SELECT id, ? FROM posts WHERE id = ? AND account_id = ?`,
    );
    for (const postId of theme.postIds) link.run(id, postId, accountId);
  }

  async latest(accountId: string) {
    const row = this.db.prepare("SELECT * FROM theme_runs WHERE account_id = ?").get(accountId) as
      RunRow | undefined;
    if (!row) return null;
    const themes = this.db
      .prepare(
        `SELECT th.name, th.description,
           (SELECT json_group_array(post_id) FROM post_themes WHERE theme_id = th.id) AS post_ids
         FROM themes th WHERE th.account_id = ? ORDER BY th.rowid`,
      )
      .all(accountId) as { name: string; description: string; post_ids: string }[];
    return {
      run: toRun(row),
      themes: themes.map((t) => ({
        name: t.name,
        description: t.description,
        postIds: fromJson<string[]>(t.post_ids) ?? [],
      })),
    };
  }
}
