import type { MetricRefreshStatusDto } from "../../../shared/refresh-types";
import { useStartJob } from "../../lib/hooks/job";
import { useResource } from "../../lib/hooks/resource";
import { JobStatus } from "../common/feedback";

const HINTS: Partial<Record<MetricRefreshStatusDto["state"], string>> = {
  missing_scopes:
    "Reconnect LinkedIn and allow Polaris to read your post and follower statistics to refresh figures from LinkedIn.",
  expired: "Reconnect LinkedIn to refresh figures from LinkedIn.",
};

/**
 * Shown only when the LinkedIn connection was granted the statistics scopes; servers whose
 * LinkedIn app lacks them never see it.
 */
export function MetricRefresh() {
  const status = useResource<MetricRefreshStatusDto>("/refresh");
  const job = useStartJob(() => status.reload());
  const s = status.data;
  if (!s) return null;
  if (s.state !== "available") {
    const hint = HINTS[s.state];
    return hint ? <p className="small muted">{hint}</p> : null;
  }
  return (
    <div className="stack">
      <p className="small">
        Account impressions and followers refresh in full. {s.refreshablePosts} of {s.totalPosts}{" "}
        posts can be refreshed through the API; LinkedIn's API cannot look up posts known only from
        an export, so their figures still come from imports.
      </p>
      <div>
        <button className="btn small" disabled={job.running} onClick={() => job.start("/refresh")}>
          Refresh from LinkedIn
        </button>
      </div>
      <JobStatus job={job} />
    </div>
  );
}
