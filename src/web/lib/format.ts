// Every formatter treats null as "not reported", which must never render as 0.

export const NOT_AVAILABLE = "Not available";

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

export function formatNumber(
  value: number | null | undefined,
  options: { compact?: boolean } = {},
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return NOT_AVAILABLE;
  if (options.compact && Math.abs(value) >= 10_000) return compact.format(value);
  return whole.format(value);
}

export function formatPercent(ratio: number | null | undefined, digits = 1): string {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return NOT_AVAILABLE;
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function formatValue(value: number | null | undefined, unit: "count" | "ratio"): string {
  return unit === "ratio" ? formatPercent(value, 2) : formatNumber(value, { compact: true });
}

/** A signed change, e.g. "+12%", or null when there is nothing honest to show. */
export function formatChange(percent: number | null | undefined): string | null {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) return null;
  const rounded = Math.round(percent * 100);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

export function changeDirection(percent: number | null | undefined): "up" | "down" | "flat" {
  if (!percent || Math.abs(percent) < 0.005) return "flat";
  return percent > 0 ? "up" : "down";
}

const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});
// Date-only values are midnight UTC; formatting them in UTC keeps the calendar day intact.
const dayFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

/** A day ("YYYY-MM-DD") or timestamp; date-only values never show a made-up time. */
export function formatDate(value: string | null | undefined, timeKnown = false): string {
  if (!value) return "Unknown date";
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return timeKnown
    ? `${dateFormat.format(date)}, ${timeFormat.format(date)}`
    : dayFormat.format(date);
}

export function formatPeriod(period: { from: string; to: string } | null | undefined): string {
  if (!period) return "";
  return `${formatDate(period.from)} to ${formatDate(period.to)}`;
}

const CONTENT_TYPES: Record<string, string> = {
  text: "Text",
  image: "Image",
  video: "Video",
  document: "Document",
  article: "Article",
  link: "Link",
  unknown: "Unknown",
};

export const contentTypeLabel = (type: string) => CONTENT_TYPES[type] ?? type;

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
