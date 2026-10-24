import type { FeedFetcher, ParsedFeed } from "../../application/intelligence/ports";
import { FeedParseError, parseFeed } from "./feed-parser";
import { FetchError, type Resolver, safeFetch, systemResolver } from "./safe-fetch";

const FEED_TYPES = [
  "application/rss+xml",
  "application/atom+xml",
  "application/rdf+xml",
  "application/xml",
  "text/xml",
];

export interface FeedFetcherOptions {
  /** POLARIS_FEEDS_ALLOW_HTTP: plain http feeds, off by default (ADR 0020). */
  allowHttp: boolean;
  resolver?: Resolver;
}

export class HttpFeedFetcher implements FeedFetcher {
  constructor(private readonly options: FeedFetcherOptions) {}

  async fetch(url: string): Promise<ParsedFeed> {
    try {
      const document = await safeFetch(url, {
        resolver: this.options.resolver ?? systemResolver,
        allowHttp: this.options.allowHttp,
        timeoutMs: 10_000,
        maxBytes: 2 * 1024 * 1024,
        maxRedirects: 3,
        accept: FEED_TYPES,
      });
      return parseFeed(document.body);
    } catch (error) {
      // Only messages written by Polaris reach the UI; anything unexpected stays generic.
      if (error instanceof FetchError || error instanceof FeedParseError) throw error;
      throw new Error("Could not read the feed", { cause: error });
    }
  }
}
