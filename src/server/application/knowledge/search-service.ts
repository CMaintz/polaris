import type {
  MatchKind,
  SearchHitDto,
  SearchMode,
  SearchResponseDto,
} from "../../../shared/knowledge-types";
import { nowIso } from "../clock";
import { type MeaningDeps, MeaningSearch } from "./meaning-search";
import type { SearchFilters, TermMode } from "./ports";
import { type Ranked, fuse, lexicalOnly } from "./ranking";
import { segments } from "./snippets";
import { queryTerms } from "./terms";

export const MAX_QUERY = 200;
const CANDIDATES = 50;

export type SearchDeps = MeaningDeps;

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

interface Ranking {
  ranked: Ranked[];
  used: SearchMode;
  notice: string | null;
}

interface RankRequest {
  text: string;
  termMode: TermMode;
  meaning: boolean;
  filters: SearchFilters;
  jobId: string | null;
}

export class KnowledgeSearch {
  private readonly meaning: MeaningSearch;

  constructor(private readonly deps: SearchDeps) {
    this.meaning = new MeaningSearch(deps);
  }

  async search(accountId: string, query: SearchQuery): Promise<SearchResponseDto> {
    const ranking = await this.rank(accountId, {
      text: query.q,
      termMode: "all",
      meaning: query.mode === "semantic",
      filters: query.filters,
      jobId: null,
    });
    const results = await this.hits(accountId, ranking.ranked.slice(0, query.limit));
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
    const meaning = await this.meaning.neighbours(accountId, { ...request, limit: CANDIDATES });
    if ("fallback" in meaning)
      return { ranked: lexical.map(lexicalOnly), used: "lexical", notice: meaning.fallback };
    return { ranked: fuse(lexical, meaning.neighbours), used: "semantic", notice: meaning.notice };
  }

  private async hits(accountId: string, top: Ranked[]): Promise<SearchHitDto[]> {
    const found = await this.deps.index.details(
      accountId,
      top.map((r) => r.postId),
    );
    const details = new Map(found.map((d) => [d.postId, d]));
    return top.flatMap((r): SearchHitDto[] => {
      const d = details.get(r.postId);
      if (!d) return [];
      const { excerpt, ...rest } = d;
      const snippet = r.lexical ? segments(r.lexical.marked) : [{ text: excerpt, hit: false }];
      return [{ ...rest, snippet, matchedBy: kinds(r), similarity: r.similarity }];
    });
  }
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
