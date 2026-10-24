import type { DayWindow } from "./campaigns";
import { addDays, daysBetween } from "./dates";
import {
  type DatedValue,
  type Granularity,
  type SeriesPoint,
  aggregate,
  comparePeriods,
  dropPartialEdges,
  fillPeriods,
  pairedRate,
} from "./timeseries";

export interface FunnelInputs {
  impressions: readonly DatedValue[];
  engagements: readonly DatedValue[];
  newFollowers: readonly DatedValue[];
}

export interface Ratio {
  value: number | null;
  pairedDays: number;
}

function ratio(
  numerator: readonly DatedValue[],
  denominator: readonly DatedValue[],
  window: DayWindow,
): Ratio {
  const { rate, days } = pairedRate(denominator, numerator, window.from, window.to);
  return { value: rate, pairedDays: days };
}

function conversions(inputs: FunnelInputs, window: DayWindow) {
  const followers = ratio(inputs.newFollowers, inputs.impressions, window);
  return {
    engagementRate: ratio(inputs.engagements, inputs.impressions, window),
    followerConversion: {
      ...followers,
      value: followers.value === null ? null : followers.value * 1000,
    },
  };
}

export interface Stage {
  value: number | null;
  observedDays: number;
}

export interface FunnelStep {
  period: string;
  from: string;
  to: string;
  totalDays: number;
  impressions: Stage;
  engagements: Stage;
  newFollowers: Stage;
  profileViews: { value: null; reason: string };
  engagementRate: Ratio;
  /** New followers per 1,000 impressions. */
  followerConversion: Ratio;
}

export const PROFILE_VIEWS_UNAVAILABLE =
  "Profile views are not in the LinkedIn exports Polaris imports, so this stage cannot be measured.";

const UNKNOWN = { value: null, pairedDays: 0 };
const BLANKED = { engagementRate: UNKNOWN, followerConversion: UNKNOWN };
const profileViews = { value: null, reason: PROFILE_VIEWS_UNAVAILABLE } as const;

function periodEnd(period: string, granularity: Granularity): string {
  if (granularity === "day") return period;
  if (granularity === "week") return addDays(period, 6);
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, month ?? 1, 0)).toISOString().slice(0, 10);
}

function stageSeries(values: readonly DatedValue[], granularity: Granularity, range: DayWindow) {
  const inRange = values.filter((v) => v.day >= range.from && v.day <= range.to);
  const filled = fillPeriods(
    aggregate(inRange, granularity, "sum"),
    range.from,
    range.to,
    granularity,
  );
  return dropPartialEdges(filled, granularity);
}

const clip = (from: string, to: string, range: DayWindow): DayWindow => ({
  from: from < range.from ? range.from : from,
  to: to > range.to ? range.to : to,
});

const stage = (point: SeriesPoint | undefined): Stage => ({
  value: point?.value ?? null,
  observedDays: point?.observedDays ?? 0,
});

/** Both conversions divide by impressions, so a blanked partial edge blanks them too. */
export function funnelPeriods(
  inputs: FunnelInputs,
  granularity: Granularity,
  range: DayWindow,
): FunnelStep[] {
  const impressions = stageSeries(inputs.impressions, granularity, range);
  const engagements = stageSeries(inputs.engagements, granularity, range);
  const newFollowers = stageSeries(inputs.newFollowers, granularity, range);
  return impressions.map((point, i) => {
    const window = clip(point.period, periodEnd(point.period, granularity), range);
    return {
      period: point.period,
      ...window,
      totalDays: daysBetween(window.from, window.to) + 1,
      impressions: stage(point),
      engagements: stage(engagements[i]),
      newFollowers: stage(newFollowers[i]),
      profileViews,
      ...(point.value === null ? BLANKED : conversions(inputs, window)),
    };
  });
}

export function funnelWindow(inputs: FunnelInputs, window: DayWindow): FunnelStep {
  const days = daysBetween(window.from, window.to) + 1;
  const total = (values: readonly DatedValue[]): Stage => {
    const { current } = comparePeriods(values, window.to, days, "sum");
    return { value: current.value, observedDays: current.observedDays };
  };
  return {
    period: window.from,
    ...window,
    totalDays: days,
    impressions: total(inputs.impressions),
    engagements: total(inputs.engagements),
    newFollowers: total(inputs.newFollowers),
    profileViews,
    ...conversions(inputs, window),
  };
}
