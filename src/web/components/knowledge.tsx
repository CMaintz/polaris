import type {
  EmergingStatus,
  EmergingThemeDto,
  IndexStatusDto,
  SnippetSegment,
  ThemePerformanceDto,
  ThemesDto,
} from "../../shared/knowledge-types";
import { formatChange, formatDate, formatNumber, formatPercent } from "../lib/format";
import { useStartJob } from "../lib/hooks";
import { ErrorBox, JobLine } from "./ui";

/** Post text arrives as plain segments; React escapes it, and only <mark> is ours. */
export function Snippet({ segments }: { segments: SnippetSegment[] }) {
  if (segments.length === 0) return <span className="muted">Text not imported yet</span>;
  return (
    <span className="snippet">
      {segments.map((s, i) =>
        s.hit ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>,
      )}
    </span>
  );
}

export function IndexStatusCard({
  status,
  onDone,
}: {
  status: IndexStatusDto;
  onDone: () => void;
}) {
  const reindex = useStartJob(onDone);
  const { semantic } = status;
  return (
    <section className="card stack">
      <header>
        <h2>Search index</h2>
        <button
          className="btn"
          disabled={reindex.running}
          onClick={() => reindex.start("/knowledge/index", {})}
        >
          Re-index
        </button>
      </header>
      <p className="small">
        Keyword index: {formatNumber(status.keywordIndexed)} of {formatNumber(status.postsWithText)}{" "}
        posts with text. It updates itself whenever you search.
      </p>
      {semantic.available ? (
        <p className="small">
          Meaning index: {formatNumber(semantic.embedded)} of {formatNumber(status.postsWithText)}{" "}
          posts, embedded with {semantic.model} through your OpenAI key.
          {semantic.embedded < status.postsWithText && " Re-index to embed the rest."}
        </p>
      ) : (
        <p className="small secondary">{semantic.reason} Keyword search works without it.</p>
      )}
      <ErrorBox error={reindex.error} />
      <JobLine job={reindex.job ?? status.lastJob} />
    </section>
  );
}

export function ThemeTable({ themes }: { themes: ThemePerformanceDto[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Theme</th>
            <th className="num">Posts</th>
            <th className="num">With metrics</th>
            <th className="num">Median impressions</th>
            <th className="num">Median engagements</th>
            <th className="num">Median rate</th>
          </tr>
        </thead>
        <tbody>
          {themes.map((t) => (
            <tr key={t.theme}>
              <td>
                <strong>{t.theme}</strong>
                <div className="small secondary">{t.description}</div>
              </td>
              <td className="num">{formatNumber(t.posts)}</td>
              <td className="num">{formatNumber(t.withMetrics)}</td>
              <td className="num">{formatNumber(t.medianImpressions)}</td>
              <td className="num">{formatNumber(t.medianEngagements)}</td>
              <td className="num">{formatPercent(t.medianEngagementRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STATUS: Record<EmergingStatus, string> = {
  emerging: "Emerging",
  fading: "Fading",
  steady: "Steady",
  insufficient: "Not enough posts",
};

function points(change: number | null): string {
  const text = formatChange(change);
  return text ? `${text.replace("%", "")} points` : "Not available";
}

export function EmergingTable({ windows, emerging }: Pick<ThemesDto, "windows" | "emerging">) {
  if (!windows)
    return (
      <p className="muted">
        Import the LinkedIn data archive, which lists every post, to compare periods.
      </p>
    );
  const label = (w: typeof windows.latest) =>
    `${formatDate(w.from)} to ${formatDate(w.to)} (${w.posts} posts, ${w.coveredDays} days covered)`;
  return (
    <>
      <p className="small secondary">
        Share of classified posts per theme. Latest: {label(windows.latest)}. Previous:{" "}
        {label(windows.previous)}. A change of 10 points or more counts as emerging or fading. This
        is a description, not a statistical test.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Theme</th>
              <th className="num">Previous share</th>
              <th className="num">Latest share</th>
              <th className="num">Change</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            {emerging.map((e: EmergingThemeDto) => (
              <tr key={e.theme}>
                <td>{e.theme}</td>
                <td className="num">{formatPercent(e.previousShare, 0)}</td>
                <td className="num">{formatPercent(e.latestShare, 0)}</td>
                <td className="num">{points(e.change)}</td>
                <td>
                  <span
                    className={`badge${e.status === "emerging" ? " top" : e.status === "fading" ? " bottom" : ""}`}
                  >
                    {STATUS[e.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
