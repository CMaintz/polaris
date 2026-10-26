import { describe, expect, it } from "vitest";
import { LinkedInApiError, type RefreshRequest } from "../../application/refresh/ports";
import { AesGcmSecretBox } from "../crypto/secret-box";
import { openDatabase } from "../db/database";
import { SqliteConnectionStore } from "../publishing/connection-store";
import { TOKEN_URL } from "../publishing/linkedin-oauth";
import { LinkedInApiProvider } from "../publishing/linkedin-provider";
import { LinkedInAnalyticsSource } from "./analytics-source";

const TOKEN = ["fake", "token", "a".repeat(20)].join("-");
const GRANTED = "openid,profile,w_member_social,r_member_postAnalytics,r_member_profileAnalytics";
const CONFIG = {
  clientId: "c",
  clientSecret: "s",
  redirectUri: "https://p.example/cb",
  apiVersion: "202604",
  analytics: true,
};
const POSTS = "https://api.linkedin.com/rest/memberCreatorPostAnalytics?";
const FOLLOWERS = "https://api.linkedin.com/rest/memberFollowersCount?";

type Route = (url: string) => Response | undefined;

const day = (iso: string) => {
  const [year, month, d] = iso.split("-").map(Number);
  return { year, month, day: d };
};
const range = (from: string, to: string) => ({ start: day(from), end: day(to) });
const wrapped = (metric: string) => ({
  "com.linkedin.adsexternalapi.memberanalytics.v1.CreatorPostAnalyticsMetricTypeV1": metric,
});
const page = (elements: object[]) =>
  Response.json({ elements, paging: { count: 10, start: 0, links: [] } });

/** Lifetime totals in the old wrapped metricType shape for reactions, plain for the rest. */
const postTotals: Route = (url) => {
  if (!url.startsWith(POSTS) || !url.includes("q=entity")) return undefined;
  const metric = /queryType=([A-Z]+)/.exec(url)?.[1] ?? "";
  const counts: Record<string, number> = { IMPRESSION: 900, REACTION: 40, RESHARE: 3 };
  if (!(metric in counts)) return page([]);
  const metricType = metric === "REACTION" ? wrapped(metric) : metric;
  return page([{ count: counts[metric], metricType, targetEntity: { share: "x" } }]);
};

async function setup(routes: Route[], options: { scope?: string; analytics?: boolean } = {}) {
  const db = openDatabase(":memory:");
  db.prepare(
    "INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES ('u', 'a@x', 'h', 'n', 'n')",
  ).run();
  db.prepare(
    "INSERT INTO accounts (id, user_id, created_at, updated_at) VALUES ('acc', 'u', 'n', 'n')",
  ).run();
  const urls: string[] = [];
  const headers: HeadersInit[] = [];
  const fetchFn = (async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    if (url === TOKEN_URL)
      return Response.json({ access_token: TOKEN, expires_in: 5184000, scope: options.scope });
    if (url.endsWith("/userinfo")) return Response.json({ sub: "m1", name: "Ada" });
    urls.push(url);
    headers.push(init.headers ?? {});
    for (const route of routes) {
      const response = route(url);
      if (response) return response;
    }
    return page([]);
  }) as typeof fetch;
  const config = { ...CONFIG, analytics: options.analytics ?? true };
  const box = new AesGcmSecretBox(Buffer.alloc(32, 9).toString("base64"));
  const connections = new SqliteConnectionStore(db);
  const clock = () => new Date("2026-03-15T12:00:00Z");
  const provider = new LinkedInApiProvider(config, connections, box, fetchFn, clock);
  await provider.completeAuthorization("acc", "code");
  const source = new LinkedInAnalyticsSource(config, connections, box, fetchFn, clock);
  return { source, urls, headers };
}

const request = (overrides: Partial<RefreshRequest>): RefreshRequest => ({
  observedOn: "2026-03-15",
  days: null,
  posts: [],
  ...overrides,
});

describe("LinkedIn analytics access", () => {
  it("is granted only when the member granted the analytics scopes", async () => {
    expect(await (await setup([], { scope: GRANTED })).source.access("acc")).toBe("granted");
    const posting = await setup([], { scope: "openid,profile,w_member_social" });
    expect(await posting.source.access("acc")).toBe("missing_scopes");
    const off = await setup([], { scope: GRANTED, analytics: false });
    expect(await off.source.access("acc")).toBe("not_enabled");
  });
});

describe("LinkedIn post statistics", () => {
  it("reads lifetime totals for share and ugcPost URNs, in either metricType shape", async () => {
    const { source, urls, headers } = await setup([postTotals], { scope: GRANTED });
    const bundle = await source.fetch(
      "acc",
      request({ posts: ["urn:li:share:7", "urn:li:ugcPost:9"] }),
    );
    expect(urls).toContain(
      `${POSTS}q=entity&entity=(share:urn%3Ali%3Ashare%3A7)&queryType=REACTION&aggregation=TOTAL`,
    );
    expect(urls.some((u) => u.includes("entity=(ugc:urn%3Ali%3AugcPost%3A9)"))).toBe(true);
    expect(headers[0]).toMatchObject({
      authorization: `Bearer ${TOKEN}`,
      "linkedin-version": "202604",
      "x-restli-protocol-version": "2.0.0",
    });
    expect(bundle.provider).toBe("linkedin-api");
    expect(bundle.postMetrics[0]).toEqual({
      externalId: "urn:li:share:7",
      observedOn: "2026-03-15",
      period: null,
      // COMMENT came back empty: unknown, never a zero.
      metrics: {
        impressions: 900,
        reactions: 40,
        comments: null,
        reposts: 3,
        clicks: null,
        engagements: null,
      },
    });
  });

  it("never asks LinkedIn about activity URNs, which its API does not accept", async () => {
    const { source, urls } = await setup([postTotals], { scope: GRANTED });
    const bundle = await source.fetch("acc", request({ posts: ["urn:li:activity:5"] }));
    expect(urls).toEqual([]);
    expect(bundle.postMetrics).toEqual([]);
  });

  it("skips a post LinkedIn refuses and keeps the others", async () => {
    const gone: Route = (url) =>
      url.includes("share%3A1)") ? new Response("{}", { status: 404 }) : undefined;
    const { source } = await setup([gone, postTotals], { scope: GRANTED });
    const bundle = await source.fetch(
      "acc",
      request({ posts: ["urn:li:share:1", "urn:li:share:2"] }),
    );
    expect(bundle.postMetrics.map((m) => m.externalId)).toEqual(["urn:li:share:2"]);
    expect(bundle.warnings).toEqual([expect.stringContaining("urn:li:share:1")]);
  });
});

describe("LinkedIn account statistics", () => {
  const impressions: Route = (url) =>
    url.startsWith(POSTS) && url.includes("q=me")
      ? page([
          { count: 50, metricType: "IMPRESSION", dateRange: range("2026-03-12", "2026-03-13") },
          { count: 70, metricType: "IMPRESSION", dateRange: range("2026-03-14", "2026-03-15") },
        ])
      : undefined;
  const followers: Route = (url) => {
    if (url === `${FOLLOWERS}q=me`) return page([{ memberFollowersCount: 100 }]);
    if (!url.startsWith(`${FOLLOWERS}q=dateRange`)) return undefined;
    return page([
      { memberFollowersCount: 2, dateRange: range("2026-03-12", "2026-03-13") },
      { memberFollowersCount: 4, dateRange: range("2026-03-13", "2026-03-14") },
      { memberFollowersCount: 1, dateRange: range("2026-03-14", "2026-03-15") },
    ]);
  };

  it("reads daily gains and back-calculates totals from today's follower count", async () => {
    const { source } = await setup([impressions, followers], { scope: GRANTED });
    const bundle = await source.fetch(
      "acc",
      request({ days: { from: "2026-03-12", until: "2026-03-15" } }),
    );
    const days = [...bundle.accountDays].sort((a, b) => a.day.localeCompare(b.day));
    expect(days).toEqual([
      { day: "2026-03-12", impressions: 50, newFollowers: 2, followers: 95, engagements: null },
      // LinkedIn reported no impressions for the 13th: unknown, not zero.
      { day: "2026-03-13", impressions: null, newFollowers: 4, followers: 99, engagements: null },
      { day: "2026-03-14", impressions: 70, newFollowers: 1, followers: 100, engagements: null },
    ]);
  });

  // LinkedIn pages its answers; asking for a week at a time keeps every answer on one page.
  it("asks for a long range a week at a time without gaps or overlaps", async () => {
    const { source, urls } = await setup([], { scope: GRANTED });
    await source.fetch("acc", request({ days: { from: "2026-02-20", until: "2026-03-08" } }));
    const ranges = urls.filter((u) => u.includes("q=me&queryType=IMPRESSION"));
    expect(ranges.map((u) => /dateRange=(.*)$/.exec(u)?.[1])).toEqual([
      "(start:(day:20,month:2,year:2026),end:(day:27,month:2,year:2026))",
      "(start:(day:27,month:2,year:2026),end:(day:6,month:3,year:2026))",
      "(start:(day:6,month:3,year:2026),end:(day:8,month:3,year:2026))",
    ]);
    expect(ranges[0]).toContain("aggregation=DAILY");
  });
});

describe("LinkedIn API failures", () => {
  const failing = (status: number) => async () => {
    const { source } = await setup([() => new Response("{}", { status })], { scope: GRANTED });
    const error = await source
      .fetch("acc", request({ days: { from: "2026-03-14", until: "2026-03-15" } }))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LinkedInApiError);
    return error as LinkedInApiError;
  };

  it("asks for a reconnect when LinkedIn rejects the token", async () => {
    expect((await failing(401)()).failure).toBe("reconnect");
  });

  it("treats rate limits and outages as passing", async () => {
    expect((await failing(429)()).failure).toBe("unavailable");
    expect((await failing(503)()).failure).toBe("unavailable");
  });

  it("treats a missing permission as final", async () => {
    expect((await failing(403)()).failure).toBe("refused");
  });
});
