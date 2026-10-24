import type { ParsedFeed, ParsedFeedItem } from "../../application/intelligence/feed-ports";
import { FeedParseError, type XmlElement, children, decodeEntities, parseXml, textOf } from "./xml";

export { FeedParseError };

const MAX_ITEMS = 200;
const MAX_TITLE = 300;
const MAX_SUMMARY = 1000;

/**
 * Feed text is shown in the UI and fenced into prompts, so it is reduced to plain text here:
 * markup is stripped (descriptions often carry escaped HTML) and lengths are capped.
 */
function plain(raw: string, max: number): string {
  const stripped = decodeEntities(raw.replace(/<[^>]*>/g, " ")).replace(/&nbsp;/gi, " ");
  return stripped.replace(/\s+/g, " ").trim().slice(0, max);
}

function first(element: XmlElement, ...names: string[]): XmlElement | undefined {
  for (const name of names) {
    const found = children(element, name)[0];
    if (found) return found;
  }
  return undefined;
}

function optional(element: XmlElement, ...names: string[]): string | null {
  const text = textOf(first(element, ...names)).trim();
  return text || null;
}

function isoDate(text: string | null): string | null {
  if (!text) return null;
  const time = Date.parse(text);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function rssItem(item: XmlElement): ParsedFeedItem {
  return {
    guid: optional(item, "guid"),
    link: optional(item, "link"),
    title: plain(textOf(first(item, "title")), MAX_TITLE),
    summary: plain(textOf(first(item, "description", "content:encoded")), MAX_SUMMARY),
    publishedAt: isoDate(optional(item, "pubdate", "dc:date")),
  };
}

function atomLink(entry: XmlElement): string | null {
  const links = children(entry, "link");
  const alternate = links.find((l) => !l.attrs["rel"] || l.attrs["rel"] === "alternate");
  return alternate?.attrs["href"]?.trim() || null;
}

function atomEntry(entry: XmlElement): ParsedFeedItem {
  return {
    guid: optional(entry, "id"),
    link: atomLink(entry),
    title: plain(textOf(first(entry, "title")), MAX_TITLE),
    summary: plain(textOf(first(entry, "summary", "content")), MAX_SUMMARY),
    publishedAt: isoDate(optional(entry, "published", "updated")),
  };
}

function feedOf(root: XmlElement): { title: string; items: ParsedFeedItem[] } {
  if (root.name === "feed") {
    return { title: textOf(first(root, "title")), items: children(root, "entry").map(atomEntry) };
  }
  const channel = first(root, "channel");
  if (root.name === "rss" && channel) {
    return {
      title: textOf(first(channel, "title")),
      items: children(channel, "item").map(rssItem),
    };
  }
  if (root.name === "rdf:rdf") {
    // RSS 1.0 keeps its items beside the channel, not inside it.
    return {
      title: textOf(channel && first(channel, "title")),
      items: children(root, "item").map(rssItem),
    };
  }
  throw new FeedParseError("This is not an RSS or Atom feed");
}

export function parseFeed(xml: string): ParsedFeed {
  const { title, items } = feedOf(parseXml(xml));
  return { title: plain(title, MAX_TITLE) || null, items: items.slice(0, MAX_ITEMS) };
}
