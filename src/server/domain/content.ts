import type { PostMetrics } from "./metrics";

export type ContentType = "text" | "image" | "video" | "document" | "article" | "link" | "unknown";

/** Which dataset a post belongs to. Demo posts are synthetic and must never pass as real. */
export type Dataset = "linkedin" | "demo";

export interface ProfileFacts {
  displayName: string | null;
  headline: string | null;
  profileUrl: string | null;
}

/** A post as a provider reported it, before Polaris assigns it an id. */
export interface ImportedPost {
  externalId: string;
  url: string | null;
  text: string | null;
  /** ISO timestamp; date-only sources use midnight UTC and set `timeKnown` false. */
  publishedAt: string | null;
  timeKnown: boolean;
  contentType: ContentType;
  sourceMetadata: Record<string, unknown>;
}

export interface ImportedPostMetrics {
  externalId: string;
  /** Day the figures were observed (the export date), not the publish date. */
  observedOn: string;
  metrics: PostMetrics;
  /** Window the figures cover, when the source states one. */
  period: { from: string; to: string } | null;
}

export interface ImportedAccountDay {
  day: string;
  followers: number | null;
  newFollowers: number | null;
  impressions: number | null;
  engagements: number | null;
}

export interface ImportedAudienceSegment {
  dimension: string;
  value: string;
  /** Fraction of the audience, 0 to 1; null when the source gives no share. */
  share: number | null;
}

/** Everything one source file contributed, already in Polaris' vocabulary. */
export interface ImportBundle {
  provider: string;
  dataset: Dataset;
  profile: ProfileFacts | null;
  posts: ImportedPost[];
  postMetrics: ImportedPostMetrics[];
  accountDays: ImportedAccountDay[];
  audience: { observedOn: string; segments: ImportedAudienceSegment[] } | null;
  warnings: string[];
}

export function emptyBundle(provider: string, dataset: Dataset = "linkedin"): ImportBundle {
  return {
    provider,
    dataset,
    profile: null,
    posts: [],
    postMetrics: [],
    accountDays: [],
    audience: null,
    warnings: [],
  };
}

// Old LinkedIn exports encode hashtags as {hashtag|\#|AI}; newer ones as plain #AI.
// Word characters only: topic names end up in AI prompts, so they must not carry markup.
const ENCODED_HASHTAG = /\{hashtag\|\\?#\|([\p{L}\p{N}_]+)\}/gu;
// The excluded leading characters keep HTML entities (&#39;) and URL fragments (/#top) out.
const PLAIN_HASHTAG = /(?:^|[^\p{L}\p{N}_&/])#([\p{L}\p{N}_]+)/gu;

/** Lower-cased, de-duplicated hashtags, so #AI and #ai count as one topic. */
export function extractHashtags(text: string | null): string[] {
  if (!text) return [];
  const found = new Set<string>();
  for (const match of text.matchAll(ENCODED_HASHTAG))
    found.add((match[1] ?? "").trim().toLowerCase());
  const plain = text.replace(ENCODED_HASHTAG, " ");
  for (const match of plain.matchAll(PLAIN_HASHTAG)) found.add((match[1] ?? "").toLowerCase());
  return [...found];
}

/** Readable text: decodes the old hashtag encoding, which is noise to a reader. */
export function displayText(text: string | null): string | null {
  return text?.replace(ENCODED_HASHTAG, (_m, tag: string) => `#${tag}`) ?? null;
}
