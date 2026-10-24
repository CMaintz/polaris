import { describe, expect, it } from "vitest";
import { FeedParseError, parseFeed } from "./feed-parser";

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Example &amp; Co</title>
  <item>
    <title><![CDATA[AI <b>hiring</b> report]]></title>
    <link>https://news.example/a</link>
    <guid isPermaLink="false">urn:a</guid>
    <pubDate>Mon, 09 Mar 2026 10:00:00 GMT</pubDate>
    <description>&lt;p&gt;Teams are &#8220;changing&#x201D;&lt;/p&gt;</description>
  </item>
  <item><title>No date</title><link>https://news.example/b</link></item>
</channel></rss>`;

const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="text">Atom blog</title>
  <entry>
    <title>Remote work</title>
    <link rel="self" href="https://blog.example/self"/>
    <link rel="alternate" href="https://blog.example/post"/>
    <id>tag:blog.example,2026:1</id>
    <updated>2026-03-01T12:00:00Z</updated>
    <summary type="html">&lt;em&gt;Short&lt;/em&gt; summary</summary>
  </entry>
</feed>`;

describe("parseFeed", () => {
  it("reads RSS items, decoding entities and stripping markup to plain text", () => {
    const feed = parseFeed(RSS);
    expect(feed.title).toBe("Example & Co");
    expect(feed.items[0]).toEqual({
      guid: "urn:a",
      link: "https://news.example/a",
      title: "AI hiring report",
      summary: "Teams are “changing”",
      publishedAt: "2026-03-09T10:00:00.000Z",
    });
    expect(feed.items[1]).toMatchObject({ guid: null, publishedAt: null });
  });

  it("reads Atom entries and prefers the alternate link", () => {
    const feed = parseFeed(ATOM);
    expect(feed.title).toBe("Atom blog");
    expect(feed.items).toEqual([
      {
        guid: "tag:blog.example,2026:1",
        link: "https://blog.example/post",
        title: "Remote work",
        summary: "Short summary",
        publishedAt: "2026-03-01T12:00:00.000Z",
      },
    ]);
  });

  it("refuses a document type declaration, so no entity can ever be expanded", () => {
    const bomb = `<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;">]><rss><channel><title>&lol2;</title></channel></rss>`;
    expect(() => parseFeed(bomb)).toThrow(FeedParseError);
  });

  it("leaves unknown entities as written instead of resolving them", () => {
    const feed = parseFeed("<rss><channel><title>A &unknown; B</title></channel></rss>");
    expect(feed.title).toBe("A &unknown; B");
  });

  it("refuses a document that is neither RSS nor Atom", () => {
    expect(() => parseFeed("<html><body>hi</body></html>")).toThrow(FeedParseError);
    expect(() => parseFeed("not xml at all")).toThrow(FeedParseError);
  });

  it("keeps a bounded number of items with bounded text", () => {
    const items = Array.from(
      { length: 300 },
      (_, i) => `<item><title>${"t".repeat(900)}</title><guid>${i}</guid></item>`,
    );
    const feed = parseFeed(`<rss><channel>${items.join("")}</channel></rss>`);
    expect(feed.items).toHaveLength(200);
    expect(feed.items[0]?.title.length).toBeLessThanOrEqual(300);
  });
});
