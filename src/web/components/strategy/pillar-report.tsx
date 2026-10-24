import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { PillarReportDto, PillarStatusDto } from "../../../shared/strategy-types";
import { NOT_AVAILABLE, formatNumber, formatPercent, formatPeriod } from "../../lib/format";
import type { Resource } from "../../lib/hooks/resource";
import { ChartLegend } from "../charts/chart-parts";
import { axisStyle, useChartColors } from "../charts/chart-theme";
import { DataTable } from "../common/data-table";
import { ResourceView } from "../common/resource-view";

const STATUS: Record<PillarStatusDto, string> = {
  under: "Under-served",
  over: "Over-served",
  on_target: "On target",
  too_few_posts: "Too few posts to judge",
  no_data: "No archive data for this window",
};

function GapChart({ report }: { report: PillarReportDto }) {
  const c = useChartColors();
  const data = report.pillars.map((p) => ({
    name: p.name,
    target: p.targetShare,
    actual: p.actualShare,
  }));
  return (
    <>
      <ChartLegend
        items={[
          [c.series1, "Target share"],
          [c.series2, "Actual share"],
        ]}
      />
      <div
        className="chart"
        style={{ height: 220 }}
        role="img"
        aria-label="Target and actual share per pillar"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis dataKey="name" {...axisStyle(c)} />
            <YAxis
              {...axisStyle(c)}
              tickFormatter={(v: number) => formatPercent(v, 0)}
              width={48}
            />
            <Bar dataKey="target" fill={c.series1} isAnimationActive={false} />
            <Bar dataKey="actual" fill={c.series2} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

function GapTable({ report }: { report: PillarReportDto }) {
  return (
    <DataTable
      headers={[
        "Pillar",
        "Target",
        "Actual",
        "Gap",
        "Status",
        "Posts",
        "Median impressions",
        "Median engagement rate",
      ]}
      rows={report.pillars.map((p) => [
        p.name,
        formatPercent(p.targetShare, 0),
        formatPercent(p.actualShare, 0),
        p.gap === null ? NOT_AVAILABLE : `${p.gap > 0 ? "+" : ""}${Math.round(p.gap * 100)} pts`,
        STATUS[p.status],
        p.posts,
        formatNumber(p.performance.medianImpressions),
        formatPercent(p.performance.medianEngagementRate, 2),
      ])}
    />
  );
}

const WINDOWS = [30, 90, 180, 365];

function coverageNote(r: PillarReportDto): string {
  if (!r.measured) {
    return "Your data archive does not cover this window, so shares cannot be counted. Import the LinkedIn data archive to measure them.";
  }
  return `Counted ${r.posts} posts on the ${r.measuredDays} of ${r.totalDays} days your data archive covers (${formatPeriod(r.measured)}). ${r.unassigned.posts} posts match no pillar. A post in several pillars counts in each.`;
}

interface ReportProps {
  report: Resource<PillarReportDto>;
  days: number;
  onDays: (days: number) => void;
}

export function PillarReport({ report, days, onDays }: ReportProps) {
  return (
    <section className="card stack" aria-label="Pillar gaps">
      <header className="row">
        <h2>Planned against actual</h2>
        <select aria-label="Window" value={days} onChange={(e) => onDays(Number(e.target.value))}>
          {WINDOWS.map((d) => (
            <option key={d} value={d}>
              Last {d} days
            </option>
          ))}
        </select>
      </header>
      <ResourceView resource={report}>
        {(r) => (
          <>
            <p className="small secondary">{coverageNote(r)}</p>
            {r.pillars.length > 0 && <GapChart report={r} />}
            {r.pillars.length > 0 && <GapTable report={r} />}
          </>
        )}
      </ResourceView>
    </section>
  );
}
