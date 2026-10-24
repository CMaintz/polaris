import type { FeedDto, TrendsDto } from "../../shared/intelligence-types";
import { useStartJob } from "../lib/hooks/job";
import { useResource } from "../lib/hooks/resource";
import { JobStatus } from "../components/common/feedback";
import { PageHead } from "../components/common/layout";
import { ResourceView } from "../components/common/resource-view";
import { Digest } from "../components/intelligence/digest";
import { Feeds } from "../components/intelligence/feeds";
import { TopicTable } from "../components/intelligence/topic-table";

export function TrendsPage() {
  const feeds = useResource<{ items: FeedDto[] }>("/intelligence/feeds");
  const trends = useResource<TrendsDto>("/intelligence/trends");
  const refresh = useStartJob(() => {
    feeds.reload();
    trends.reload();
  });
  return (
    <div className="stack">
      <PageHead
        title="Trends"
        intro="News feeds you follow, matched against the topics of your own posts. Matching is plain keyword overlap, so every count can be checked against the items below."
        actions={
          <button
            className="btn"
            disabled={refresh.running}
            onClick={() => refresh.start("/intelligence/feeds/refresh", {})}
          >
            Refresh feeds
          </button>
        }
      />
      <JobStatus job={refresh} />
      <Feeds feeds={feeds.data?.items ?? null} error={feeds.error} onChange={feeds.reload} />
      <ResourceView resource={trends}>{(data) => <TopicTable trends={data} />}</ResourceView>
      <Digest />
    </div>
  );
}
