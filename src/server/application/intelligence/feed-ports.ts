import type { DigestAiDto, TrendMatchDto } from "../../../shared/intelligence-types";

export interface ParsedFeedItem {
  guid: string | null;
  link: string | null;
  title: string;
  summary: string;
  publishedAt: string | null;
}

export interface ParsedFeed {
  title: string | null;
  items: ParsedFeedItem[];
}

/** Fetches and parses a feed. Throws an error whose message is safe to show. */
export interface FeedFetcher {
  fetch(url: string): Promise<ParsedFeed>;
}

export interface Feed {
  id: string;
  url: string;
  title: string | null;
  lastFetchedAt: string | null;
  lastStatus: "ok" | "error" | null;
  lastError: string | null;
  itemCount: number;
  createdAt: string;
}

export interface StoredFeedItem {
  id: string;
  feedId: string;
  feedTitle: string | null;
  title: string;
  summary: string;
  link: string | null;
  publishedAt: string | null;
  fetchedAt: string;
}

export interface FeedStore {
  list(accountId: string): Promise<Feed[]>;
  get(accountId: string, id: string): Promise<Feed | null>;
  /** Null when the account already has a feed with this URL. */
  create(accountId: string, url: string, now: string): Promise<Feed | null>;
  delete(accountId: string, id: string): Promise<boolean>;
  addItems(
    feedId: string,
    items: (ParsedFeedItem & { key: string })[],
    now: string,
  ): Promise<number>;
  recordFetch(
    feedId: string,
    result: { title: string | null; error: string | null },
    now: string,
  ): Promise<void>;
  items(accountId: string, since: string): Promise<StoredFeedItem[]>;
  firstFetch(accountId: string): Promise<string | null>;
  pruneBefore(accountId: string, before: string): Promise<void>;
}

export interface StoredDigest {
  id: string;
  from: string;
  to: string;
  matches: TrendMatchDto[];
  ai: DigestAiDto;
  createdAt: string;
}

export interface DigestStore {
  /** Saves under the job id, replacing an earlier attempt of the same job. */
  save(accountId: string, digest: StoredDigest): Promise<void>;
  list(accountId: string, limit: number): Promise<StoredDigest[]>;
}
