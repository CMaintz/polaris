import { describe, expect, it } from "vitest";
import { PublishError } from "../../application/action/provider-ports";
import { AesGcmSecretBox } from "../crypto/secret-box";
import { openDatabase } from "../db/database";
import { SqliteConnectionStore } from "./connection-store";
import { LinkedInApiProvider, POSTS_URL } from "./linkedin-provider";
import { TOKEN_URL, USERINFO_URL } from "./linkedin-oauth";
import { toLittleText } from "./little-text";

// Built at runtime so secret scanners do not mistake it for a real token.
const TOKEN = ["fake", "token", "z".repeat(20)].join("-");
const CONFIG = {
  clientId: "client-1",
  clientSecret: "secret-1",
  redirectUri: "https://polaris.example/api/action/publishing/linkedin-api/callback",
  apiVersion: "202610",
};

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(postResponse: () => Response) {
  const calls: Call[] = [];
  const fetchFn = (async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    if (String(url) === TOKEN_URL)
      return Response.json({ access_token: TOKEN, expires_in: 5184000 });
    if (String(url) === USERINFO_URL)
      return Response.json({ sub: "782bbtaQ", name: "Ada Lovelace" });
    return postResponse();
  }) as typeof fetch;
  return { calls, fetchFn };
}

function setup(
  postResponse = () =>
    new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:42" } }),
) {
  const db = openDatabase(":memory:");
  db.prepare(
    "INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES ('u', 'a@x', 'h', 'n', 'n')",
  ).run();
  db.prepare(
    "INSERT INTO accounts (id, user_id, created_at, updated_at) VALUES ('acc', 'u', 'n', 'n')",
  ).run();
  let now = new Date("2026-03-15T12:00:00Z");
  const fake = fakeFetch(postResponse);
  const box = new AesGcmSecretBox(Buffer.alloc(32, 3).toString("base64"));
  const provider = new LinkedInApiProvider(
    CONFIG,
    new SqliteConnectionStore(db),
    box,
    fake.fetchFn,
    () => now,
  );
  return { db, provider, ...fake, setNow: (iso: string) => (now = new Date(iso)) };
}

describe("LinkedIn sign-in", () => {
  it("asks for posting and OpenID scopes with the state it was given", () => {
    const url = new URL(setup().provider.authorizationUrl("st4te"));
    expect(url.origin + url.pathname).toBe("https://www.linkedin.com/oauth/v2/authorization");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "client-1",
      redirect_uri: CONFIG.redirectUri,
      state: "st4te",
      scope: "openid profile w_member_social",
    });
  });

  it("exchanges the code, stores the token sealed and reports when it expires", async () => {
    const { provider, calls, db, setNow } = setup();
    await provider.completeAuthorization("acc", "the-code");
    const exchange = new URLSearchParams(String(calls[0]?.init.body));
    expect(Object.fromEntries(exchange)).toMatchObject({
      grant_type: "authorization_code",
      code: "the-code",
      client_secret: "secret-1",
    });
    expect(JSON.stringify(db.prepare("SELECT * FROM publishing_connections").all())).not.toContain(
      TOKEN,
    );
    expect(await provider.connectionStatus("acc")).toEqual({
      state: "connected",
      displayName: "Ada Lovelace",
      expiresAt: "2026-05-14T12:00:00.000Z",
    });
    setNow("2026-05-15T00:00:00Z");
    expect((await provider.connectionStatus("acc")).state).toBe("expired");
  });

  it("deletes the token on disconnect", async () => {
    const { provider, db } = setup();
    await provider.completeAuthorization("acc", "the-code");
    await provider.disconnect("acc");
    expect(db.prepare("SELECT COUNT(*) AS n FROM publishing_connections").get()).toEqual({ n: 0 });
    expect((await provider.connectionStatus("acc")).state).toBe("not_connected");
  });
});

describe("LinkedIn posting", () => {
  it("creates a public post as the member and returns its URN and link", async () => {
    const { provider, calls } = setup();
    await provider.completeAuthorization("acc", "the-code");
    const result = await provider.publish("acc", "Hello (world) #hiring");
    const post = calls.find((c) => c.url === POSTS_URL);
    if (!post) throw new Error("no post request");
    const headers = post.init.headers as Record<string, string>;
    expect(headers).toMatchObject({
      authorization: `Bearer ${TOKEN}`,
      "linkedin-version": "202610",
      "x-restli-protocol-version": "2.0.0",
    });
    expect(JSON.parse(String(post.init.body))).toMatchObject({
      author: "urn:li:person:782bbtaQ",
      commentary: "Hello \\(world\\) #hiring",
      visibility: "PUBLIC",
      lifecycleState: "PUBLISHED",
    });
    expect(result).toEqual({
      externalId: "urn:li:share:42",
      url: "https://www.linkedin.com/feed/update/urn:li:share:42/",
    });
  });

  it("says a 4xx posted nothing but a 5xx may have", async () => {
    for (const [status, outcome] of [
      [422, "not_published"],
      [503, "unknown"],
    ] as const) {
      const { provider } = setup(() => new Response("{}", { status }));
      await provider.completeAuthorization("acc", "the-code");
      const error = await provider.publish("acc", "x").catch((e: unknown) => e);
      expect(error).toBeInstanceOf(PublishError);
      expect((error as PublishError).outcome).toBe(outcome);
    }
  });
});

describe("little text", () => {
  it("keeps hashtags but escapes markup that could forge a mention", () => {
    expect(toLittleText("#ai and C# @[Bob](urn:li:person:1) a_b")).toBe(
      "#ai and C\\# \\@\\[Bob\\]\\(urn:li:person:1\\) a\\_b",
    );
  });
});
