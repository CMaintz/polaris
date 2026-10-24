import type { EvidenceItem, Insight, InsightInputs } from "./insight-types";
import type { PeriodSummary } from "./timeseries";

const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;
const perDay = (p: PeriodSummary) =>
  p.value === null || p.observedDays === 0 ? null : Math.round(p.value / p.observedDays);
const covered = (p: PeriodSummary) => p.observedDays / p.totalDays;

export function impressionsChange({ impressions, sources }: InsightInputs): Insight | null {
  if (!impressions) return null;
  const { current, previous, change } = impressions;
  if (change.percent === null || covered(current) < 0.5 || covered(previous) < 0.5) return null;
  if (Math.abs(change.percent) < 0.1) return null;
  const up = change.percent > 0;
  return {
    key: "impressions-change",
    title: `Impressions ${up ? "up" : "down"} ${pct(Math.abs(change.percent))}`,
    observation: `Impressions averaged ${perDay(current)} a day over the last ${current.totalDays} days (${current.observedDays} days with data), against ${perDay(previous)} a day in the ${previous.totalDays} days before (${previous.observedDays} days with data).`,
    interpretation: up
      ? "Your content reached noticeably more people. Check which posts drove it before changing course."
      : "Reach fell. It can be posting less often, weaker topics, or ordinary fluctuation.",
    action: up
      ? "Look at the top posts of the period and consider repeating their format or topic."
      : "Compare this period's posts with the previous period's top posts.",
    signal: "Impressions over the next period, compared with this one.",
    confidence: covered(current) >= 0.9 && covered(previous) >= 0.9 ? "high" : "medium",
    evidence: [
      periodEvidence("e1", "Impressions, current period", current, sources.account),
      periodEvidence("e2", "Impressions, previous period", previous, sources.account),
    ],
  };
}

function periodEvidence(id: string, label: string, p: PeriodSummary, source: string): EvidenceItem {
  return { id, label, value: p.value, unit: "count", period: { from: p.from, to: p.to }, source };
}
