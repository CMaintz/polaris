import { createHash } from "node:crypto";
import { PermanentJobError } from "../../application/errors";
import type { ReadContext, SocialDataProvider, SourceFile } from "../../application/imports/ports";
import {
  type ContentType,
  GENERIC_CSV,
  type ImportBundle,
  type ImportedPost,
  emptyBundle,
  extractHashtags,
} from "../../domain/content";
import type { PostMetrics } from "../../domain/metrics";
import { csvRecords, normaliseHeader, pick } from "./csv";
import { parseNumber, parseTimestamp } from "./values";

// Header aliases per field; matching ignores case, spaces and punctuation (docs/07).
const COLUMNS = {
  date: ["date", "published", "published at", "publish date", "created"],
  text: ["text", "content", "body", "post", "caption"],
  url: ["url", "link", "post url"],
  type: ["type", "content type", "media type"],
  impressions: ["impressions", "views"],
  reactions: ["reactions", "likes"],
  comments: ["comments"],
  reposts: ["reposts", "shares"],
  engagements: ["engagements"],
  hashtags: ["hashtags", "tags", "topics"],
} as const;

const CONTENT_TYPES: readonly ContentType[] = [
  "text",
  "image",
  "video",
  "document",
  "article",
  "link",
];

type Row = Record<string, string>;

/**
 * A platform-neutral posts CSV for platforms without their own adapter. It is read as a full
 * listing of the posts in its date range (ADR 0026), so it supports post counts.
 */
export class GenericPostsCsvProvider implements SocialDataProvider {
  readonly id = GENERIC_CSV;
  readonly label = "Posts CSV";
  readonly platform = "other";
  readonly files = "a .csv with date and text columns";

  canRead(file: SourceFile): boolean {
    return file.name.toLowerCase().endsWith(".csv");
  }

  async read(file: SourceFile, context: ReadContext): Promise<ImportBundle[]> {
    const records = csvRecords(new TextDecoder("utf-8").decode(file.bytes));
    assertColumns(file.name, records[0]);
    const bundle = emptyBundle(this.id);
    records.forEach((record, index) =>
      addRow(bundle, record, { file: file.name, row: index + 2, observedOn: context.importedOn }),
    );
    return [bundle];
  }
}

function addRow(
  bundle: ImportBundle,
  record: Row,
  where: { file: string; row: number; observedOn: string },
): void {
  const post = toPost(record);
  if (!post) {
    bundle.warnings.push(`${where.file} row ${where.row}: no usable date or text, skipped`);
    return;
  }
  bundle.posts.push(post);
  const metrics = toMetrics(record);
  if (metrics) {
    bundle.postMetrics.push({
      externalId: post.externalId,
      observedOn: where.observedOn,
      metrics,
      period: null,
    });
  }
}

function assertColumns(name: string, first: Row | undefined): void {
  const has = (aliases: readonly string[]) =>
    first !== undefined && aliases.some((a) => normaliseHeader(a) in first);
  if (!has(COLUMNS.date) || !has(COLUMNS.text)) {
    throw new PermanentJobError(`${name} needs a "date" and a "text" column`);
  }
}

function toPost(record: Row): ImportedPost | null {
  const published = parseTimestamp(pick(record, ...COLUMNS.date));
  const text = pick(record, ...COLUMNS.text)?.replace(/\r\n?/g, "\n") ?? null;
  if (!published || !text) return null;
  const url = pick(record, ...COLUMNS.url);
  return {
    externalId: postIdentity(url, published.iso, text),
    url,
    text,
    publishedAt: published.iso,
    timeKnown: published.timeKnown,
    contentType: contentType(pick(record, ...COLUMNS.type)),
    topics: topics(pick(record, ...COLUMNS.hashtags)),
    sourceMetadata: {},
  };
}

/**
 * The URL when there is one; otherwise a hash of date and text, so re-importing the same file
 * matches the same posts. The prefixes keep the two kinds of id from ever colliding.
 */
function postIdentity(url: string | null, publishedAt: string, text: string): string {
  // Kept whole apart from the fragment: query strings are permalinks on some platforms (?p=12).
  if (url) return `url:${url.trim().replace(/#.*$/, "")}`;
  const digest = createHash("sha256").update(`${publishedAt}\n${text.trim()}`).digest("hex");
  return `sha256:${digest}`;
}

function contentType(value: string | null): ContentType {
  const type = value?.toLowerCase() as ContentType | undefined;
  return type && CONTENT_TYPES.includes(type) ? type : "unknown";
}

function topics(value: string | null): string[] {
  if (!value) return [];
  const tags = value.split(/[,;\s]+/).filter(Boolean);
  return extractHashtags(tags.map((t) => `#${t.replace(/^#/, "")}`).join(" "));
}

/** Missing figures stay null; engagements are never summed from parts here (docs/02). */
function toMetrics(record: Row): PostMetrics | null {
  const value = (aliases: readonly string[]) => parseNumber(pick(record, ...aliases));
  const metrics: PostMetrics = {
    impressions: value(COLUMNS.impressions),
    reactions: value(COLUMNS.reactions),
    comments: value(COLUMNS.comments),
    reposts: value(COLUMNS.reposts),
    clicks: null,
    engagements: value(COLUMNS.engagements),
  };
  return Object.values(metrics).some((v) => v !== null) ? metrics : null;
}
