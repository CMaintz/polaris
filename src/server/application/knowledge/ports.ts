import type { Theme } from "../../domain/themes";
import type { AiProvider, AiProviderId } from "../ai/ports";

export interface SearchFilters {
  contentType?: string;
  topic?: string;
  theme?: string;
  from?: string;
  to?: string;
}

export type TermMode = "all" | "any";

export interface LexicalHit {
  postId: string;
  /** Snippet with matches wrapped in SNIPPET_MARK.open / .close. */
  marked: string;
  matchedTerms: string[];
}

// Private-use characters: they never occur in post text once the index strips them.
export const SNIPPET_MARK = {
  open: String.fromCharCode(0xe000),
  close: String.fromCharCode(0xe001),
} as const;

export interface HitDetails {
  postId: string;
  publishedAt: string | null;
  timeKnown: boolean;
  contentType: string;
  topics: string[];
  themes: string[];
  excerpt: string;
}

export interface AccountOwners {
  ownerOf(accountId: string): Promise<string | null>;
}

export interface KeywordIndex extends AccountOwners {
  /** Brings the full-text index in line with the posts; returns how many were rewritten. */
  sync(accountId: string, now: string): Promise<number>;
  search(
    accountId: string,
    terms: string[],
    mode: TermMode,
    filters: SearchFilters,
    limit: number,
  ): Promise<LexicalHit[]>;
  documents(accountId: string): Promise<{ postId: string; text: string }[]>;
  /** Posts passing the filters, or null when no filter is set. */
  filteredIds(accountId: string, filters: SearchFilters): Promise<Set<string> | null>;
  details(accountId: string, postIds: string[]): Promise<HitDetails[]>;
  indexedCount(accountId: string): Promise<number>;
}

export interface StoredVector {
  postId: string;
  textHash: string;
  vector: Float32Array;
}

export interface VectorStore {
  vectors(accountId: string, model: string): Promise<StoredVector[]>;
  save(accountId: string, model: string, entries: StoredVector[], now: string): Promise<void>;
  /** Drops vectors of posts outside `keep` or embedded with another model. */
  prune(accountId: string, model: string, keep: ReadonlySet<string>): Promise<void>;
}

export interface EmbeddingResult {
  vectors: Float32Array[];
  model: string;
  inputTokens: number | null;
}

export interface Embedder {
  readonly provider: AiProviderId;
  readonly model: string;
  embed(texts: string[]): Promise<EmbeddingResult>;
}

export type EmbedderLookup =
  { embedder: Embedder; reason: null } | { embedder: null; reason: string };

/** The user's active raw key; `model` is their chat model, not an embedding model. */
export interface KeySource {
  activeKey(
    userId: string,
  ): Promise<{ provider: AiProviderId; apiKey: string; model: string } | null>;
}

export interface EmbedderSource {
  forUser(userId: string): Promise<EmbedderLookup>;
}

export type { InteractionRecorder } from "../ai/recorded-call";

export interface ProviderSource {
  activeProvider(userId: string): Promise<AiProvider | null>;
}

export interface ThemeRun {
  interactionId: string | null;
  provider: string;
  model: string;
  promptVersion: string;
  classifiedPostIds: string[];
  postsAvailable: number;
  basedOnDemo: boolean;
  createdAt: string;
}

export interface ThemeStore {
  replace(accountId: string, run: ThemeRun, themes: Theme[]): Promise<void>;
  latest(accountId: string): Promise<{ run: ThemeRun; themes: Theme[] } | null>;
}

export type ResolveAccount = (userId: string) => Promise<string | null>;
