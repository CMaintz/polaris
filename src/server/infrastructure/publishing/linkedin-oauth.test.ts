import { describe, expect, it } from "vitest";
import { ANALYTICS_SCOPES, TOKEN_URL, authorizationUrl, exchangeCode } from "./linkedin-oauth";

const CONFIG = {
  clientId: "client-1",
  clientSecret: "secret-1",
  redirectUri: "https://polaris.example/cb",
  apiVersion: "202610",
};

const requestedScopes = (analytics: boolean) =>
  new URL(authorizationUrl({ ...CONFIG, analytics }, "s")).searchParams.get("scope")?.split(" ");

function grantFetch(scope: string | undefined) {
  return (async (url: string | URL) =>
    String(url) === TOKEN_URL
      ? Response.json({ access_token: "t", expires_in: 60, scope })
      : Response.json({ sub: "m1", name: null })) as typeof fetch;
}

describe("LinkedIn analytics scopes", () => {
  // An app without the Community Management product fails the whole sign-in on these scopes.
  it("requests the analytics scopes only when the server opts in", () => {
    expect(requestedScopes(false)).not.toContain("r_member_postAnalytics");
    expect(requestedScopes(true)).toEqual(
      expect.arrayContaining(["w_member_social", ...ANALYTICS_SCOPES]),
    );
  });

  it("reports the scopes LinkedIn actually granted, whatever the separator", async () => {
    const comma = await exchangeCode(
      CONFIG,
      "c",
      grantFetch("openid,profile,w_member_social,r_member_postAnalytics"),
    );
    expect(comma.scopes).toEqual([
      "openid",
      "profile",
      "w_member_social",
      "r_member_postAnalytics",
    ]);
    const spaced = await exchangeCode(CONFIG, "c", grantFetch("openid r_member_profileAnalytics"));
    expect(spaced.scopes).toEqual(["openid", "r_member_profileAnalytics"]);
    expect((await exchangeCode(CONFIG, "c", grantFetch(undefined))).scopes).toEqual([]);
  });
});
