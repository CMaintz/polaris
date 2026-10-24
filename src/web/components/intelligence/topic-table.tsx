import type { TrendsDto } from "../../../shared/intelligence-types";
import { formatDate } from "../../lib/format";
import { Empty } from "../common/layout";
import { MatchList } from "./match-list";

export function TopicTable({ trends }: { trends: TrendsDto }) {
  if (trends.topics.length === 0) {
    return (
      <Empty title="No topics to match yet">
        <p>Topics come from the hashtags in your posts. Import your LinkedIn data to see trends.</p>
      </Empty>
    );
  }
  return (
    <section className="card stack">
      <h2>Matched items per topic</h2>
      <p className="small secondary">
        {trends.trackedSince
          ? `Tracking since ${formatDate(trends.trackedSince)}; longer windows undercount before that.`
          : "No feed has been fetched yet, so no counts are available."}
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Topic</th>
              <th className="num">Last 7 days</th>
              <th className="num">Last 30 days</th>
              <th className="num">Last 90 days</th>
            </tr>
          </thead>
          <tbody>
            {trends.topics.map((t) => (
              <tr key={t.topic}>
                <td>#{t.topic}</td>
                <td className="num">{trends.trackedSince ? t.last7 : "Not available"}</td>
                <td className="num">{trends.trackedSince ? t.last30 : "Not available"}</td>
                <td className="num">{trends.trackedSince ? t.last90 : "Not available"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Recent matches</h3>
      <MatchList matches={trends.recent} />
    </section>
  );
}
