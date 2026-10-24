// FTS5 rows cannot carry a foreign key, so the FTS rowid is knowledge_documents.doc_id
// (posts.rowid can change on VACUUM). A deleted post cascades there; the trigger unindexes it.
export const KNOWLEDGE_SCHEMA: readonly string[] = [
  `CREATE TABLE knowledge_documents (
    doc_id INTEGER PRIMARY KEY,
    post_id TEXT NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    search_hash TEXT NOT NULL,
    indexed_at TEXT NOT NULL
  )`,
  "CREATE INDEX knowledge_documents_account ON knowledge_documents(account_id)",
  `CREATE VIRTUAL TABLE post_search USING fts5(
    body, topics, tokenize = 'unicode61 remove_diacritics 2'
  )`,
  `CREATE TRIGGER knowledge_documents_unindex AFTER DELETE ON knowledge_documents BEGIN
    DELETE FROM post_search WHERE rowid = old.doc_id;
  END`,
  `CREATE TABLE post_embeddings (
    post_id TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    model TEXT NOT NULL,
    text_hash TEXT NOT NULL,
    vector BLOB NOT NULL,
    embedded_at TEXT NOT NULL
  )`,
  "CREATE INDEX post_embeddings_account ON post_embeddings(account_id, model)",
  `CREATE TABLE theme_runs (
    account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    interaction_id TEXT REFERENCES ai_interactions(id) ON DELETE SET NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    classified_post_ids TEXT NOT NULL,
    posts_available INTEGER NOT NULL,
    based_on_demo INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )`,
  // Themes belong to the run that found them, so wiping a demo run takes its themes along.
  `CREATE TABLE themes (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES theme_runs(account_id) ON DELETE CASCADE,
    name TEXT NOT NULL COLLATE NOCASE,
    description TEXT NOT NULL,
    UNIQUE (account_id, name)
  )`,
  `CREATE TABLE post_themes (
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    theme_id TEXT NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, theme_id)
  )`,
  "CREATE INDEX post_themes_theme ON post_themes(theme_id)",
];
