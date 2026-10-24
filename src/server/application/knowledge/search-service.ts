import type {
  MatchKind,
  SearchHitDto,
  SearchMode,
  SearchResponseDto,
} from "../../../shared/knowledge-types";
import { type Clock, nowIso } from "../clock";
import type {
  Embedder,
  EmbedderSource,
  InteractionRecorder,
  KeywordIndex,
  LexicalHit,
  SearchFilters,
  TermMode,
  VectorStore,
} from "./ports";
import { segments } from "./snippets";
import { type Neighbour, fuseRanks, nearest } from "./ranking";
import { recordedEmbedding } from "./embedding-call";
import { queryTerms } from "./terms";

export const MAX_QUERY = 200;
const CANDIDATES = 50;
// text-embedding-3-small scores unrelated English text around 0.1 to 0.2; below this floor
// a "match" is noise (ADR 0017).
const SIMILARITY_FLOOR = 0.3;
const KEYWORDS_SHOWN = "Showing keyword matches.";

export interface SearchDeps {
  index: KeywordIndex;
  vectors: VectorStore;
  embedders: EmbedderSource;
  recorder: InteractionRecorder;
  clock: Clock;
}

export interface SearchQuery {
  q: string;
  mode: SearchMode;
  filters: SearchFilters;
  limit: number;
}

/** Why a post was retrieved, for the Ask pipeline's evidence (docs/03 s9 step 3). */
export interface ContextCandidate {
  postId: string;
  matchedTerms: string[];
  similarity: number | null;
  reason: string;
}

interface Ranked {
  postId: string;
  lexical: LexicalHit | null;
  similarity: number | null;
}

interface Ranking {
  ranked: Ranked[];
  used: SearchMode;
  notice: string | null;
}

type Meaning = { neighbours: Neighbour[]; notice: string | null } | { fallback: string };

interface RankRequest {
  text: string;
  termMode: TermMode;
  meaning: boolean;
  filters: SearchFilters;
  jobId: string | null;
}

export class KnowledgeSearch {
  constructor(private readonly deps: SearchDeps) {}

  async search(accountId: string, query: SearchQuery): Promise<SearchResponseDto> {
    const ranking = await this.rank(accountId, {
      text: query.q,
      termMode: "all",
      meaning: query.mode === "semantic",
      filters: query.filters,
      jobId: null,
    });
    const top = ranking.ranked.slice(0, query.limit);
    const details = new Map(
      (
        await this.deps.index.details(
          accountId,
          top.map((r) => r.postId),
        )
      ).map((d) => [d.postId, d]),
    );
    const results = top.flatMap((r): SearchHitDto[] => {
      const d = details.get(r.postId);
      if (!d) return [];
      const { excerpt, ...rest } = d;
      const snippet = r.lexical ? segments(r.lexical.marked) : [{ text: excerpt, hit: false }];
      return [{ ...rest, snippet, matchedBy: kinds(r), similarity: r.similarity }];
    });
    return { requested: query.mode, used: ranking.used, notice: ranking.notice, results };
  }

  /**
   * The posts most relevant to a question, by any of its words and, when an OpenAI key is
   * active, by meaning. Returns ids and reasons only; callers load the facts themselves.
   */
  async retrieveContext(
    accountId: string,
    question: string,
    limit: number,
    options: { jobId?: string } = {},
  ): Promise<ContextCandidate[]> {
    const { ranked } = await this.rank(accountId, {
      text: question,
      termMode: "any",
      meaning: true,
      filters: {},
      jobId: options.jobId ?? null,
    });
    return ranked.slice(0, limit).map((r) => {
      const matchedTerms = r.lexical?.matchedTerms ?? [];
      return {
        postId: r.postId,
        matchedTerms,
        similarity: r.similarity,
        reason: reasonFor(matchedTerms, r.similarity),
      };
    });
  }

  private async rank(accountId: string, request: RankRequest): Promise<Ranking> {
    const { index } = this.deps;
    await index.sync(accountId, nowIso(this.deps.clock));
    const terms = queryTerms(request.text, request.termMode);
    const lexical = await index.search(
      accountId,
      terms,
      request.termMode,
      request.filters,
      CANDIDATES,
    );
    if (!request.meaning)
      return { ranked: lexical.map(lexicalOnly), used: "lexical", notice: null };
    const meaning = await this.meaning(accountId, request);
    if ("fallback" in meaning)
      return { ranked: lexical.map(lexicalOnly), used: "lexical", notice: meaning.fallback };
    return { ranked: fuse(lexical, meaning.neighbours), used: "semantic", notice: meaning.notice };
  }

  private async meaning(accountId: string, request: RankRequest): Promise<Meaning> {
    const owner = await this.deps.index.ownerOf(accountId);
    if (!owner) return { fallback: "Meaning search is not available for this account." };
    const { embedder, reason } = await this.deps.embedders.forUser(owner);
    if (!embedder) return { fallback: `${reason} ${KEYWORDS_SHOWN}` };
    const stored = await this.deps.vectors.vectors(accountId, embedder.model);
    if (stored.length === 0)
      return {
        fallback: `No posts are indexed for meaning search yet. Run Re-index. ${KEYWORDS_SHOWN}`,
      };
    const query = await this.embedQuery(owner, embedder, request);
    if (typeof query === "string") return { fallback: query };
    const allowed = await this.deps.index.filteredIds(accountId, request.filters);
    const options = { allowed, floor: SIMILARITY_FLOOR, limit: CANDIDATES };
    const neighbours = nearest(query, stored, options);
    return { neighbours, notice: await this.coverageNotice(accountId, stored.length) };
  }

  private async embedQuery(owner: string, embedder: Embedder, request: RankRequest) {
    const context = {
      userId: owner,
      jobId: request.jobId,
      promptName: "query-embedding",
      promptVersion: "v1",
      inputSummary: { purpose: "search", texts: 1, includesPostText: false },
    };
    try {
      const [vector] = await recordedEmbedding(this.deps, embedder, context, [request.text]);
      return vector as Float32Array;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Meaning search failed (${message}). ${KEYWORDS_SHOWN}`;
    }
  }

  private async coverageNotice(accountId: string, embedded: number): Promise<string | null> {
    const indexed = await this.deps.index.indexedCount(accountId);
    if (embedded >= indexed) return null;
    return `${embedded} of ${indexed} posts are indexed for meaning search. Run Re-index to include the rest.`;
  }
}

const lexicalOnly = (hit: LexicalHit): Ranked => ({
  postId: hit.postId,
  lexical: hit,
  similarity: null,
});

function fuse(lexical: LexicalHit[], neighbours: Neighbour[]): Ranked[] {
  const byId = new Map(lexical.map((h) => [h.postId, h]));
  const similarity = new Map(neighbours.map((n) => [n.postId, n.similarity]));
  const order = fuseRanks([lexical.map((h) => h.postId), neighbours.map((n) => n.postId)]);
  return order.map((postId) => ({
    postId,
    lexical: byId.get(postId) ?? null,
    similarity: similarity.get(postId) ?? null,
  }));
}

function kinds(r: Ranked): MatchKind[] {
  const out: MatchKind[] = [];
  if (r.lexical) out.push("keywords");
  if (r.similarity !== null) out.push("meaning");
  return out;
}

function reasonFor(terms: string[], similarity: number | null): string {
  const parts: string[] = [];
  if (terms.length > 0) parts.push(`matches ${terms.map((t) => `"${t}"`).join(", ")}`);
  if (similarity !== null) parts.push(`similar in meaning (${similarity.toFixed(2)})`);
  return parts.join("; ") || "matches the question";
}
