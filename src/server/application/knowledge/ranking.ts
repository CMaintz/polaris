import type { LexicalHit, StoredVector } from "./ports";

// Reciprocal rank fusion constant from Cormack et al. (SIGIR 2009). Fusing ranks rather than
// scores avoids normalising bm25 (unbounded) against cosine similarity (bounded).
const RRF_K = 60;

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] as number;
    const y = b[i] as number;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
}

export interface Neighbour {
  postId: string;
  similarity: number;
}

/** The most similar vectors at or above `floor`; `allowed` null means every post. */
export function nearest(
  query: Float32Array,
  stored: readonly StoredVector[],
  options: { allowed: ReadonlySet<string> | null; floor: number; limit: number },
): Neighbour[] {
  return stored
    .filter((s) => s.vector.length === query.length && (options.allowed?.has(s.postId) ?? true))
    .map((s) => ({ postId: s.postId, similarity: cosine(query, s.vector) }))
    .filter((n) => n.similarity >= options.floor)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, options.limit);
}

function fuseRanks(lists: readonly (readonly string[])[]): string[] {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, rank) => scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + rank + 1)));
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

export interface Ranked {
  postId: string;
  lexical: LexicalHit | null;
  similarity: number | null;
}

export const lexicalOnly = (hit: LexicalHit): Ranked => ({
  postId: hit.postId,
  lexical: hit,
  similarity: null,
});

export function fuse(lexical: LexicalHit[], neighbours: Neighbour[]): Ranked[] {
  const byId = new Map(lexical.map((h) => [h.postId, h]));
  const similarity = new Map(neighbours.map((n) => [n.postId, n.similarity]));
  const order = fuseRanks([lexical.map((h) => h.postId), neighbours.map((n) => n.postId)]);
  return order.map((postId) => ({
    postId,
    lexical: byId.get(postId) ?? null,
    similarity: similarity.get(postId) ?? null,
  }));
}
