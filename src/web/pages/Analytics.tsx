import { useState } from "react";
import type { BreakdownsDto, SeriesPointDto } from "../../shared/api-types";
import { tzOffset } from "../lib/api";
import { WEEKDAYS, contentTypeLabel, formatPeriod } from "../lib/format";
import { useResource } from "../lib/hooks";
import { SegmentBars, TrendChart } from "../components/charts";
import { ErrorBox, Field, Loading, PageHead } from "../components/ui";

const METRICS: [string, string][] = [
  ["impressions", "Impressions"],
  ["engagements", "Engagements"],
  ["followers", "Followers"],
  ["new_followers", "New followers"],
  ["posts", "Posts published"],
];

interface Series {
  from: string;
  to: string;
  source: string;
  points: SeriesPointDto[];
}

export function AnalyticsPage() {
  const [metric, setMetric] = useState("impressions");
  const [granularity, setGranularity] = useState("week");
  const [days, setDays] = useState("365");
  const label = METRICS.find(([m]) => m === metric)?.[1] ?? metric;
  const series = useResource<Series>(
    `/analytics/timeseries?metric=${metric}&granularity=${granularity}&rolling=${granularity === "day" ? 7 : 4}&days=${days}`,
  );
  const breakdowns = useResource<BreakdownsDto>(`/analytics/breakdowns?tz=${tzOffset()}`);

  return (
    <div className="stack">
      <PageHead
        title="Analytics"
        intro="Trends over time, and which kinds of posts do best. Gaps in a line are periods without data, not zeros."
      />
      <div className="card form-grid">
        <Field label="Metric">
          <select value={metric} onChange={(e) => setMetric(e.target.value)}>
            {METRICS.map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Group by">
          <select value={granularity} onChange={(e) => setGranularity(e.target.value)}>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </Field>
        <Field label="Range">
          <select value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="90">Last 90 days</option>
            <option value="180">Last 6 months</option>
            <option value="365">Last 12 months</option>
            <option value="730">Last 2 years</option>
          </select>
        </Field>
      </div>
      <div className="card">
        <header>
          <h2>{label}</h2>
          {series.data && (
            <span className="small muted">
              {formatPeriod(series.data)}. Source: {series.data.source}
            </span>
          )}
        </header>
        <ErrorBox error={series.error} />
        {series.data ? (
          <TrendChart
            points={series.data.points}
            label={label}
            rollingLabel={granularity === "day" ? "7-day average" : "4-period average"}
          />
        ) : (
          <Loading />
        )}
      </div>
      {breakdowns.data && <Breakdowns data={breakdowns.data} />}
    </div>
  );
}

function Breakdowns({ data }: { data: BreakdownsDto }) {
  return (
    <div className="grid two">
      <div className="card">
        <h2>By content type</h2>
        <SegmentBars segments={data.contentTypes} label={contentTypeLabel} />
      </div>
      <div className="card">
        <h2>By topic</h2>
        {data.topics.length ? (
          <SegmentBars segments={data.topics.slice(0, 10)} label={(k) => `#${k}`} />
        ) : (
          <p className="muted">No hashtags in your imported posts yet.</p>
        )}
      </div>
      <div className="card">
        <h2>By weekday</h2>
        <SegmentBars
          segments={[...data.weekdays].sort((a, b) => Number(a.key) - Number(b.key))}
          label={(k) => WEEKDAYS[Number(k)] ?? k}
        />
      </div>
      <div className="card">
        <h2>By hour posted</h2>
        <p className="small muted">
          Your local time. {data.postsWithTime} posts have a known publish time.
        </p>
        {data.hours.length ? (
          <SegmentBars
            segments={[...data.hours].sort((a, b) => Number(a.key) - Number(b.key))}
            label={(k) => `${k.padStart(2, "0")}:00`}
          />
        ) : (
          <p className="muted">Publish times come from the data archive.</p>
        )}
      </div>
    </div>
  );
}
