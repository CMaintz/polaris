import { unzipSync } from "fflate";
import { PermanentJobError } from "../../application/errors";
import type { SocialDataProvider, SourceFile } from "../../application/imports/ports";
import {
  type ContentType,
  type ImportBundle,
  type ImportedPost,
  emptyBundle,
} from "../../domain/content";
import { csvRecords, pick } from "./csv";
import { externalIdFromUrl, parseTimestamp } from "./values";

export const DATA_EXPORT_PROVIDER = "linkedin-data-export";

const KNOWN_FILES = ["shares.csv", "profile.csv"];

function baseName(path: string): string {
  return (path.split(/[\\/]/).pop() ?? path).toLowerCase();
}

function isZip(file: SourceFile): boolean {
  return file.name.toLowerCase().endsWith(".zip");
}

/**
 * LinkedIn's member data archive ("Get a copy of your data"), as the ZIP or as the CSVs
 * inside it. Only Shares.csv and Profile.csv are read; the rest of the archive (messages,
 * connections, ...) is deliberately ignored to keep personal data out of Polaris.
 */
export class LinkedInDataExportProvider implements SocialDataProvider {
  readonly id = DATA_EXPORT_PROVIDER;
  readonly label = "LinkedIn data archive";

  constructor(private readonly options = { maxEntryBytes: 200 * 1024 * 1024 }) {}

  canRead(file: SourceFile): boolean {
    return isZip(file) || KNOWN_FILES.includes(baseName(file.name));
  }

  async read(file: SourceFile): Promise<ImportBundle[]> {
    const entries = isZip(file)
      ? unzipKnownFiles(file.bytes, this.options.maxEntryBytes)
      : { [baseName(file.name)]: file.bytes };
    const bundle = emptyBundle(this.id);
    const shares = entries["shares.csv"];
    const profile = entries["profile.csv"];
    if (!shares && !profile) {
      throw new PermanentJobError(`${file.name} contains neither Shares.csv nor Profile.csv`);
    }
    if (shares) readShares(decode(shares), bundle);
    if (profile) bundle.profile = readProfile(decode(profile));
    return [bundle];
  }
}

function unzipKnownFiles(bytes: Uint8Array, maxEntryBytes: number): Record<string, Uint8Array> {
  let tooLarge: string | null = null;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter: (entry) => {
        if (!KNOWN_FILES.includes(baseName(entry.name))) return false;
        // Checked before inflating: a few-MB archive can expand to gigabytes.
        if (entry.originalSize > maxEntryBytes) tooLarge = entry.name;
        return tooLarge === null;
      },
    });
  } catch {
    throw new PermanentJobError("The ZIP file could not be opened");
  }
  if (tooLarge) throw new PermanentJobError(`${tooLarge} in the archive is too large to import`);
  return Object.fromEntries(Object.entries(entries).map(([path, data]) => [baseName(path), data]));
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

function readShares(text: string, bundle: ImportBundle): void {
  csvRecords(text).forEach((record, index) => {
    const post = toPost(record);
    if (post) bundle.posts.push(post);
    else bundle.warnings.push(`Shares.csv row ${index + 2}: no usable link or date, skipped`);
  });
}

function toPost(record: Record<string, string>): ImportedPost | null {
  const url = pick(record, "ShareLink", "Share Link", "Link");
  const published = parseTimestamp(pick(record, "Date", "Share Date", "Created"));
  const externalId = externalIdFromUrl(url);
  if (!externalId || !published) return null;
  const sharedUrl = pick(record, "SharedUrl", "Shared URL");
  const mediaUrl = pick(record, "MediaUrl", "Media URL");
  return {
    externalId,
    url,
    text: pick(record, "ShareCommentary", "Commentary", "Text")?.replace(/\r\n?/g, "\n") ?? null,
    publishedAt: published.iso,
    timeKnown: published.timeKnown,
    contentType: inferContentType(url, sharedUrl, mediaUrl),
    sourceMetadata: {
      sharedUrl,
      mediaUrl,
      visibility: pick(record, "Visibility"),
    },
  };
}

function inferContentType(
  url: string | null,
  sharedUrl: string | null,
  mediaUrl: string | null,
): ContentType {
  if (url?.includes("/pulse/")) return "article";
  if (mediaUrl) return mediaType(mediaUrl);
  if (sharedUrl) return "link";
  return "text";
}

function mediaType(mediaUrl: string): ContentType {
  if (/video|\.mp4/i.test(mediaUrl)) return "video";
  if (/\.pdf|document/i.test(mediaUrl)) return "document";
  return "image";
}

function readProfile(text: string): ImportBundle["profile"] {
  const record = csvRecords(text)[0];
  if (!record) return null;
  const name = [pick(record, "First Name"), pick(record, "Last Name")].filter(Boolean).join(" ");
  return {
    displayName: name || null,
    headline: pick(record, "Headline"),
    profileUrl: pick(record, "Public Profile Url", "Profile URL"),
  };
}
