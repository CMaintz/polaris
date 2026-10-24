import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import type { FunnelStepDto, RatioDto, StageDto } from "../../../shared/strategy-types";
import { NOT_AVAILABLE, formatNumber, formatPercent } from "../../lib/format";
import { axisStyle, useChartColors } from "../charts/chart-theme";
import { DataTable } from "../common/data-table";
import { coverage, perThousand } from "./measures";

const stageCell = (s: StageDto, totalDays: number) =>
  s.value === null
    ? NOT_AVAILABLE
    : `${formatNumber(s.value)} (${coverage(s.observedDays, totalDays)})`;

const ratioCell = (r: RatioDto, text: string, totalDays: number) =>
  r.value === null ? NOT_AVAILABLE : `${text} (paired ${coverage(r.pairedDays, totalDays)})`;

export function FunnelStep({ step }: { step: FunnelStepDto }) {
  return (
    <div className="stack">
      <StageChart step={step} />
      <DataTable
        headers={["Stage", "Value (days with data)"]}
        rows={[
          ["Impressions", stageCell(step.impressions, step.totalDays)],
          [
            "Engagement rate",
            ratioCell(
              step.engagementRate,
              formatPercent(step.engagementRate.value, 2),
              step.totalDays,
            ),
          ],
          ["Engagements", stageCell(step.engagements, step.totalDays)],
          ["Profile views", `${NOT_AVAILABLE}: ${step.profileViews.reason}`],
          [
            "Follower conversion",
            ratioCell(
              step.followerConversion,
              perThousand(step.followerConversion.value),
              step.totalDays,
            ),
          ],
          ["New followers", stageCell(step.newFollowers, step.totalDays)],
        ]}
      />
    </div>
  );
}

function StageChart({ step }: { step: FunnelStepDto }) {
  const c = useChartColors();
  const stages = [
    { name: "Impressions", value: step.impressions.value },
    { name: "Engagements", value: step.engagements.value },
    { name: "New followers", value: step.newFollowers.value },
  ];
  const known = stages.filter((s) => s.value !== null).length;
  return (
    <div
      className="chart"
      style={{ height: 180 }}
      role="img"
      aria-label={`Funnel, ${known} of 3 stages have data`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={stages}
          layout="vertical"
          margin={{ top: 4, right: 72, bottom: 4, left: 8 }}
        >
          <CartesianGrid stroke={c.grid} horizontal={false} />
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={110} {...axisStyle(c)} />
          <Bar dataKey="value" fill={c.series1} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            <LabelList
              dataKey="value"
              position="right"
              fill={c.text}
              formatter={(v: unknown) =>
                v === null || v === undefined ? NOT_AVAILABLE : formatNumber(Number(v))
              }
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
