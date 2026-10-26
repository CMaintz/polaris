import { z } from "zod";
import type { NewJob } from "../jobs/ports";

export const METRIC_REFRESH_JOB = "metric-refresh";

// The account is fixed when the refresh is queued, so switching accounts while it waits
// cannot send one account's figures to another.
export const refreshPayload = z.object({ accountId: z.string().min(1) });

export function metricRefreshJob(userId: string, accountId: string): NewJob {
  return {
    userId,
    type: METRIC_REFRESH_JOB,
    payload: { accountId, label: "Refresh from LinkedIn" },
    maxRetries: 3,
  };
}
