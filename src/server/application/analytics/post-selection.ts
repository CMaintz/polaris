import { dayOf } from "../../domain/dates";
import { type PostMetricKey, postMetricValue } from "../../domain/metrics";
import type { Band, PostRecord } from "../../domain/posts";

export interface PostQuery {
  q?: string;
  type?: string;
  topic?: string;
  band?: Band;
  from?: string;
  to?: string;
  sort: "published" | PostMetricKey;
  dir: "asc" | "desc";
  limit: number;
  offset: number;
}

export function matchesQuery(
  post: PostRecord,
  query: PostQuery,
  bands: Map<string, Band>,
): boolean {
  const day = post.publishedAt ? dayOf(post.publishedAt) : null;
  if (query.q && !(post.text ?? "").toLowerCase().includes(query.q.toLowerCase())) return false;
  if (query.type && post.contentType !== query.type) return false;
  if (query.topic && !post.topics.includes(query.topic)) return false;
  if (query.band && bands.get(post.id) !== query.band) return false;
  if (query.from && (!day || day < query.from)) return false;
  if (query.to && (!day || day > query.to)) return false;
  return true;
}

export function byPublished(dir: "asc" | "desc") {
  const sign = dir === "asc" ? 1 : -1;
  return (a: PostRecord, b: PostRecord) =>
    sign * (a.publishedAt ?? "").localeCompare(b.publishedAt ?? "");
}

/** Sorts by a metric with unknown values always last, whichever the direction. */
export function byMetric(key: PostMetricKey, dir: "asc" | "desc") {
  const sign = dir === "asc" ? 1 : -1;
  return (a: PostRecord, b: PostRecord) => {
    const x = postMetricValue(a.metrics, key);
    const y = postMetricValue(b.metrics, key);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return sign * (x - y);
  };
}

/** Posts most like this one: same content type or a shared topic, nearest in time. */
export function comparablePosts(post: PostRecord, posts: PostRecord[]): PostRecord[] {
  const time = (p: PostRecord) => (p.publishedAt ? new Date(p.publishedAt).getTime() : 0);
  return posts
    .filter((p) => p.id !== post.id)
    .filter(
      (p) => p.contentType === post.contentType || p.topics.some((t) => post.topics.includes(t)),
    )
    .sort((a, b) => Math.abs(time(a) - time(post)) - Math.abs(time(b) - time(post)))
    .slice(0, 5);
}
