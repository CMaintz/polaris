import { ValidationError } from "../../application/errors";

// LinkedIn's three-legged OAuth 2.0 flow and OpenID Connect userinfo (ADR 0025):
// https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
// https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2

const AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
export const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
export const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
/** Posting as the member needs w_member_social; openid and profile give the member id. */
const SCOPES = ["openid", "profile", "w_member_social"];
/**
 * Post and follower statistics. They belong to the Community Management API product, which
 * LinkedIn approves per app, and asking for a scope the app lacks fails the whole sign-in.
 * https://learn.microsoft.com/en-us/linkedin/marketing/community-management/members/post-statistics
 * https://learn.microsoft.com/en-us/linkedin/marketing/community-management/members/follower-statistics
 */
export const ANALYTICS_SCOPES = ["r_member_postAnalytics", "r_member_profileAnalytics"];

export interface LinkedInAppConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** The Posts API version header, YYYYMM; LinkedIn retires each version after about a year. */
  apiVersion: string;
  /** Ask for ANALYTICS_SCOPES too; only for apps LinkedIn approved for them. */
  analytics?: boolean;
  /** Days after publishing that a post's figures keep being refreshed. */
  refreshPostDays?: number;
}

export interface MemberGrant {
  accessToken: string;
  /** Seconds until the token expires (60 days today); LinkedIn issues no refresh token to most apps. */
  expiresIn: number;
  memberId: string;
  name: string | null;
  /** What the member granted, which can be less than what was asked for. */
  scopes: string[];
}

/** Safe to show: it never carries LinkedIn's response body. */
class LinkedInAuthError extends ValidationError {}

export function authorizationUrl(config: LinkedInAppConfig, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    state,
    scope: [...SCOPES, ...(config.analytics ? ANALYTICS_SCOPES : [])].join(" "),
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeCode(
  config: LinkedInAppConfig,
  code: string,
  fetchFn: typeof fetch,
): Promise<MemberGrant> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
  });
  const token = await json(
    await fetchFn(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }),
  );
  const accessToken = stringField(token, "access_token");
  const expiresIn = Number(token["expires_in"]);
  const info = await json(
    await fetchFn(USERINFO_URL, { headers: { authorization: `Bearer ${accessToken}` } }),
  );
  const name = typeof info["name"] === "string" ? info["name"] : null;
  return {
    accessToken,
    expiresIn,
    memberId: stringField(info, "sub"),
    name,
    scopes: grantedScopes(token["scope"]),
  };
}

// LinkedIn's samples separate granted scopes with commas, where OAuth 2.0 uses spaces.
function grantedScopes(scope: unknown): string[] {
  return typeof scope === "string" ? scope.split(/[\s,]+/).filter(Boolean) : [];
}

async function json(response: Response): Promise<Record<string, unknown>> {
  // The error body can echo request details; keep it out of the message.
  if (!response.ok) throw new LinkedInAuthError(`LinkedIn sign-in failed (${response.status})`);
  return (await response.json()) as Record<string, unknown>;
}

function stringField(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value) {
    throw new LinkedInAuthError(`LinkedIn's response had no ${key}`);
  }
  return value;
}
