import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SegmentDto, SeriesPointDto } from "../../shared/api-types";
import { NOT_AVAILABLE, formatDate, formatNumber } from "../lib/format";
import { useCssVars } from "../lib/hooks";

const VARS = "--series-1,--series-2,--grid,--axis,--muted,--surface,--text,--border";

function useChartColors() {
  const v = useCssVars(VARS);
  return {
    series1: v["--series-1"] || "#2a78d6",
    series2: v["--series-2"] || "#eb6834",
    grid: v["--grid"] || "#e1e0d9",
    axis: v["--axis"] || "#c3c2b7",
    muted: v["--muted"] || "#898781",
    surface: v["--surface"] || "#fcfcfb",
    text: v["--text"] || "#0b0b0b",
    border: v["--border"] || "#e1e0d9",
  };
}

type Colors = ReturnType<typeof useChartColors>;

const tooltipStyle = (c: Colors) => ({
  contentStyle: {
    background: c.surface,
    border: `1px solid ${c.border}`,
    borderRadius: 8,
    color: c.text,
  },
  labelStyle: { color: c.text, fontWeight: 600 },
});

const axisProps = (c: Colors) => ({
  stroke: c.axis,
  tick: { fill: c.muted, fontSize: 12 },
  tickLine: false,
});

/** Every chart has a table view, so no value is reachable only by hovering. */
function TableView({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <details>
      <summary>View as table</summary>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={h} className={i > 0 ? "num" : undefined}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row[0])}>
                {row.map((cell, i) => (
                  <td key={i} className={i > 0 ? "num" : undefined}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

interface TrendProps {
  points: SeriesPointDto[];
  label: string;
  rollingLabel?: string;
}

/** A daily series with gaps where the source had no data: missing days are not drawn as zero. */
export function TrendChart({ points, label, rollingLabel }: TrendProps) {
  const c = useChartColors();
  const hasRolling = Boolean(rollingLabel) && points.some((p) => p.rolling !== null);
  const known = points.filter((p) => p.value !== null).length;
  return (
    <>
      {hasRolling && (
        <div className="legend" aria-hidden>
          <span>
            <i style={{ background: c.series1 }} />
            {label}
          </span>
          <span>
            <i style={{ background: c.series2 }} />
            {rollingLabel}
          </span>
        </div>
      )}
      <div
        className="chart"
        role="img"
        aria-label={`${label}: ${known} of ${points.length} periods have data`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis
              dataKey="period"
              {...axisProps(c)}
              tickFormatter={(d: string) => formatDate(d).replace(/,? \d{4}$/, "")}
              minTickGap={24}
            />
            <YAxis
              {...axisProps(c)}
              width={48}
              tickFormatter={(v: number) => formatNumber(v, { compact: true })}
              axisLine={false}
            />
            <Tooltip
              {...tooltipStyle(c)}
              labelFormatter={(d) => formatDate(String(d))}
              formatter={(v) =>
                v === null || v === undefined ? NOT_AVAILABLE : formatNumber(Number(v))
              }
            />
            <Line
              type="monotone"
              dataKey="value"
              name={label}
              stroke={c.series1}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
            {hasRolling && (
              <Line
                type="monotone"
                dataKey="rolling"
                name={rollingLabel}
                stroke={c.series2}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <TableView
        headers={["Period", label, ...(hasRolling && rollingLabel ? [rollingLabel] : [])]}
        rows={points.map((p) => [
          formatDate(p.period),
          formatNumber(p.value),
          ...(hasRolling ? [formatNumber(p.rolling)] : []),
        ])}
      />
    </>
  );
}

interface SegmentProps {
  segments: SegmentDto[];
  label: (key: string) => string;
  metric?: "medianEngagements" | "medianImpressions";
}

/** Median per segment, one hue (identity is the axis label, not the colour). */
export function SegmentBars({ segments, label, metric = "medianEngagements" }: SegmentProps) {
  const c = useChartColors();
  const data = segments.map((s) => ({
    name: label(s.key),
    value: s[metric],
    posts: s.withMetrics,
  }));
  const title = metric === "medianEngagements" ? "Median engagements" : "Median impressions";
  return (
    <>
      <div className="chart" style={{ height: Math.max(160, data.length * 34 + 40) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
            barCategoryGap={6}
          >
            <CartesianGrid stroke={c.grid} horizontal={false} />
            <XAxis
              type="number"
              {...axisProps(c)}
              tickFormatter={(v: number) => formatNumber(v, { compact: true })}
            />
            <YAxis type="category" dataKey="name" {...axisProps(c)} width={130} axisLine={false} />
            <Tooltip
              {...tooltipStyle(c)}
              cursor={{ fill: c.grid, opacity: 0.4 }}
              formatter={(v, _n, item) => [
                `${v === null || v === undefined ? NOT_AVAILABLE : formatNumber(Number(v))} (${(item.payload as { posts: number }).posts} posts)`,
                title,
              ]}
            />
            <Bar
              dataKey="value"
              name={title}
              fill={c.series1}
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TableView
        headers={["Segment", title, "Posts with metrics", "Posts"]}
        rows={segments.map((s) => [label(s.key), formatNumber(s[metric]), s.withMetrics, s.posts])}
      />
    </>
  );
}
