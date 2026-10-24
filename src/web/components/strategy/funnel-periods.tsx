import { useState } from "react";
import type { FunnelDto, FunnelStepDto } from "../../../shared/strategy-types";
import { NOT_AVAILABLE, formatDate, formatNumber, formatPercent } from "../../lib/format";
import { DataTable } from "../common/data-table";
import { NeedsData } from "../common/layout";
import { FunnelStep } from "./funnel-step";

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

export function PeriodTable({ funnel }: { funnel: FunnelDto }) {
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

/** Opens on the latest measured period; the picker offers only periods with impressions. */
export function PeriodFunnel({ funnel }: { funnel: FunnelDto }) {
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
      <FunnelStep step={step} />
      <p className="small muted">
        Source: {funnel.source}. Periods cut off at either end of the range are left out, so a part
        week never reads as a drop.
      </p>
    </section>
  );
}
