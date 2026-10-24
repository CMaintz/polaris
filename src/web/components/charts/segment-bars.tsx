import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SegmentDto } from "../../../shared/post-types";
import { NOT_AVAILABLE, formatNumber } from "../../lib/format";
import { TableView } from "./chart-parts";
import { axisProps, tooltipStyle, useChartColors } from "./chart-theme";

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
