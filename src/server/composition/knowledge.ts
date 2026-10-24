import { KNOWLEDGE_INDEX_JOB, KnowledgeIndexer } from "../application/knowledge/index-service";
import { KnowledgeSearch } from "../application/knowledge/search-service";
import { KNOWLEDGE_THEMES_JOB, ThemeService } from "../application/knowledge/theme-service";
import { SqliteKeywordIndex } from "../infrastructure/db/knowledge-store";
import { KeyedEmbedderSource } from "../infrastructure/knowledge/openai-embedder";
import { SqliteThemeStore } from "../infrastructure/knowledge/theme-store";
import { SqliteVectorStore } from "../infrastructure/knowledge/vector-store";
import type { EvidenceFacts } from "../application/analytics/evidence-facts";
import { SearchRelatedPosts } from "../application/knowledge/related-posts";
import type { AiKeyParts } from "./ai";
import type { Core } from "./core";

export function buildKnowledge(core: Core, ai: AiKeyParts, facts: EvidenceFacts) {
  const { db, jobs, queries, clock } = core;
  const index = new SqliteKeywordIndex(db);
  const recorder = ai.aiStore;
  const deps = {
    index,
    vectors: new SqliteVectorStore(db),
    embedders: new KeyedEmbedderSource(ai.credentials),
    recorder,
    clock,
  };
  const search = new KnowledgeSearch(deps);
  const indexer = new KnowledgeIndexer({ ...deps, jobs });
  const themes = new ThemeService({
    providers: ai.credentials,
    posts: queries,
    themes: new SqliteThemeStore(db),
    owners: index,
    recorder,
    jobs,
    clock,
  });
  const handlers = {
    [KNOWLEDGE_INDEX_JOB]: indexer.run.bind(indexer),
    [KNOWLEDGE_THEMES_JOB]: themes.run.bind(themes),
  };
  const related = new SearchRelatedPosts({ resolveAccount: core.resolveAccount, search, facts });
  return { search, indexer, themes, related, handlers };
}
