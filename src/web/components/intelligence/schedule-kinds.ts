import type { ScheduleKind } from "../../../shared/intelligence-types";

export const SCHEDULE_KINDS: Record<ScheduleKind, string> = {
  feed_refresh: "Refresh feeds",
  trend_digest: "Trend digest",
  account_review: "AI account review",
  research_rerun: "Re-run a research question",
  metric_refresh: "Refresh figures from LinkedIn",
};
