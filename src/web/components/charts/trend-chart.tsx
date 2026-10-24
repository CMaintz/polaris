import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SeriesPointDto } from "../../../shared/analytics-types";
import { NOT_AVAILABLE, formatDate, formatNumber } from "../../lib/format";
import { ChartLegend, TableView } from "./chart-parts";
import { axisProps, tooltipStyle, useChartColors } from "./chart-theme";

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
        <ChartLegend
          items={[
            [c.series1, label],
            [c.series2, rollingLabel ?? ""],
          ]}
        />
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
