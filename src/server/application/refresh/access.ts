import type { MetricRefreshState } from "../../../shared/refresh-types";
import type { Platform } from "../../domain/accounts";
import { LinkedInApiError } from "./ports";
import type { AnalyticsAccess } from "./ports";
import { PermanentJobError } from "../errors";

const REFUSALS: Record<Exclude<MetricRefreshState, "available">, string> = {
  not_linkedin: "Refreshing from LinkedIn works only on a LinkedIn account",
  not_enabled: "Refreshing from LinkedIn is not enabled on this server",
  not_connected: "Connect LinkedIn under Settings first",
  expired: "The LinkedIn sign-in has expired; reconnect LinkedIn",
  missing_scopes: "Reconnect LinkedIn and allow Polaris to read your post and follower statistics",
};

export function refreshState(
  platform: Platform | null,
  access: AnalyticsAccess,
): MetricRefreshState {
  if (platform !== "linkedin") return "not_linkedin";
  return access === "granted" ? "available" : access;
}

/** Why a refresh cannot run, or null when it can. */
export function refusal(state: MetricRefreshState): string | null {
  return state === "available" ? null : REFUSALS[state];
}

/** Retrying cannot fix a rejected sign-in or a refusal, so only outages stay retryable. */
export function jobError(error: unknown): unknown {
  if (!(error instanceof LinkedInApiError)) return error;
  if (error.failure === "unavailable") return error;
  if (error.failure === "reconnect")
    return new PermanentJobError(`${error.message}; reconnect LinkedIn under Settings`);
  return new PermanentJobError(error.message);
}
