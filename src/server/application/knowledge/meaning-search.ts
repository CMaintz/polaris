import type { Clock } from "../clock";
import { recordedEmbedding } from "./embedding-call";
import type {
  Embedder,
  EmbedderSource,
  InteractionRecorder,
  KeywordIndex,
  SearchFilters,
  VectorStore,
} from "./ports";
import { type Neighbour, nearest } from "./ranking";

// text-embedding-3-small scores unrelated English text around 0.1 to 0.2; below this floor
// a "match" is noise (ADR 0017).
const SIMILARITY_FLOOR = 0.3;
const KEYWORDS_SHOWN = "Showing keyword matches.";

export interface MeaningDeps {
  index: KeywordIndex;
  vectors: VectorStore;
  embedders: EmbedderSource;
  recorder: InteractionRecorder;
  clock: Clock;
}

export interface MeaningRequest {
  text: string;
  filters: SearchFilters;
  jobId: string | null;
  limit: number;
}

/** Either the nearest posts, or the user-facing reason keyword results are shown instead. */
export type Meaning = { neighbours: Neighbour[]; notice: string | null } | { fallback: string };

export class MeaningSearch {
  constructor(private readonly deps: MeaningDeps) {}

  async neighbours(accountId: string, request: MeaningRequest): Promise<Meaning> {
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
    const options = { allowed, floor: SIMILARITY_FLOOR, limit: request.limit };
    const neighbours = nearest(query, stored, options);
    return { neighbours, notice: await this.coverageNotice(accountId, stored.length) };
  }

  private async embedQuery(owner: string, embedder: Embedder, request: MeaningRequest) {
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
