import type {
  EmergingStatus,
  EmergingThemeDto,
  ThemePerformanceDto,
  ThemesDto,
} from "../../../shared/knowledge-types";
import { formatChange, formatDate, formatNumber, formatPercent } from "../../lib/format";

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
