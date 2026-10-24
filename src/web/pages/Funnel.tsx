import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import type {
  CampaignDto,
  CampaignFunnelDto,
  FunnelDto,
  FunnelStepDto,
  RatioDto,
  StageDto,
} from "../../shared/strategy-types";
import {
  NOT_AVAILABLE,
  formatDate,
  formatNumber,
  formatPercent,
  formatPeriod,
} from "../lib/format";
import { useResource } from "../lib/hooks";
import { ResourceView } from "../components/resource";
import { useChartColors } from "../components/charts";
import { coverage, perThousand } from "../components/strategy";
import { DataTable } from "../components/ui";
import { Empty, NeedsData, PageHead } from "../components/ui";

const stageCell = (s: StageDto, totalDays: number) =>
  s.value === null
    ? NOT_AVAILABLE
    : `${formatNumber(s.value)} (${coverage(s.observedDays, totalDays)})`;

const ratioCell = (r: RatioDto, text: string, totalDays: number) =>
  r.value === null ? NOT_AVAILABLE : `${text} (paired ${coverage(r.pairedDays, totalDays)})`;

function FunnelView({ step }: { step: FunnelStepDto }) {
  const c = useChartColors();
  const stages = [
    { name: "Impressions", value: step.impressions.value },
    { name: "Engagements", value: step.engagements.value },
    { name: "New followers", value: step.newFollowers.value },
  ];
  const known = stages.filter((s) => s.value !== null).length;
  return (
    <div className="stack">
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
            <YAxis
              type="category"
              dataKey="name"
              width={110}
              stroke={c.axis}
              tick={{ fill: c.muted, fontSize: 12 }}
            />
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

// Periods are UTC calendar days; formatting in UTC keeps the month intact.
const monthFormat = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const periodLabel = (step: FunnelStepDto, granularity: "week" | "month") =>
  granularity === "week"
    ? `Week of ${formatDate(step.period)}`
    : monthFormat.format(new Date(`${step.period}T00:00:00Z`));

function PeriodTable({ funnel }: { funnel: FunnelDto }) {
  return (
    <DataTable
      headers={[
        "Period",
        "Impressions",
        "Engagement rate",
        "Engagements",
        "Followers per 1,000",
        "New followers",
        "Days with data",
      ]}
      rows={funnel.steps.map((s) => [
        periodLabel(s, funnel.granularity),
        formatNumber(s.impressions.value),
        formatPercent(s.engagementRate.value, 2),
        formatNumber(s.engagements.value),
        s.followerConversion.value === null ? NOT_AVAILABLE : s.followerConversion.value.toFixed(2),
        formatNumber(s.newFollowers.value),
        `${s.impressions.observedDays} of ${s.totalDays}`,
      ])}
    />
  );
}

function PeriodFunnel({ funnel }: { funnel: FunnelDto }) {
  const measured = funnel.steps.filter((s) => s.impressions.value !== null);
  const [selected, setSelected] = useState<string | null>(null);
  const step = measured.find((s) => s.period === selected) ?? measured.at(-1);
  if (!step) return <NeedsData />;
  return (
    <section className="card stack" aria-label="Funnel for one period">
      <header className="row">
        <h2>{periodLabel(step, funnel.granularity)}</h2>
        <select
          aria-label="Period"
          value={step.period}
          onChange={(e) => setSelected(e.target.value)}
        >
          {measured.map((s) => (
            <option key={s.period} value={s.period}>
              {periodLabel(s, funnel.granularity)}
            </option>
          ))}
        </select>
      </header>
      <FunnelView step={step} />
      <p className="small muted">
        Source: {funnel.source}. Periods cut off at either end of the range are left out, so a part
        week never reads as a drop.
      </p>
    </section>
  );
}

function CampaignFunnel() {
  const campaigns = useResource<{ items: CampaignDto[] }>("/strategy/campaigns");
  const [id, setId] = useState("");
  const funnel = useResource<CampaignFunnelDto>(id ? `/strategy/campaigns/${id}/funnel` : null);
  const items = campaigns.data?.items ?? [];
  if (campaigns.data && items.length === 0) {
    return (
      <Empty title="No campaigns yet">
        Create a campaign to see its funnel over the campaign window.
      </Empty>
    );
  }
  return (
    <section className="card stack" aria-label="Campaign funnel">
      <header className="row">
        <h2>Campaign funnel</h2>
        <select aria-label="Campaign" value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">Choose a campaign</option>
          {items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </header>
      {id && (
        <ResourceView resource={funnel}>
          {(f) =>
            f.step ? (
              <>
                <p className="small secondary">{formatPeriod(f.step)}</p>
                <FunnelView step={f.step} />
              </>
            ) : (
              <p className="muted">
                This campaign has not started yet, so there is nothing to measure.
              </p>
            )
          }
        </ResourceView>
      )}
    </section>
  );
}

export function FunnelPage() {
  const [granularity, setGranularity] = useState<"week" | "month">("week");
  const funnel = useResource<FunnelDto>(`/strategy/funnel?granularity=${granularity}`);
  return (
    <div className="stack">
      <PageHead
        title="Funnel"
        intro="From impressions to engagements to new followers, with the conversion between each step. Rates use only days that report both figures."
        actions={
          <select
            aria-label="Granularity"
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as "week" | "month")}
          >
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
        }
      />
      <ResourceView resource={funnel}>
        {(f) => (
          <>
            <PeriodFunnel key={granularity} funnel={f} />
            <section className="card stack" aria-label="All periods">
              <h2>All periods</h2>
              <PeriodTable funnel={f} />
            </section>
          </>
        )}
      </ResourceView>
      <CampaignFunnel />
    </div>
  );
}
