import { LABEL_NAMES, type Labels } from "../../application/telemetry/ports";

// Prometheus text exposition format 0.0.4:
// https://prometheus.io/docs/instrumenting/exposition_formats/#text-based-format
export const CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

const PREFIX = "polaris_";

/** Upper bounds in seconds; AI jobs can run for minutes, requests should take milliseconds. */
export const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 300];

export interface Histogram {
  /** Already cumulative: entry i counts every observation at or under BUCKETS[i]. */
  buckets: number[];
  sum: number;
  count: number;
}

const escape = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

/** Fixed label order, so the same labels always make the same series key. */
export function seriesKey(labels: Labels): string {
  return LABEL_NAMES.filter((name) => labels[name] !== undefined)
    .map((name) => `${name}="${escape(labels[name] ?? "")}"`)
    .join(",");
}

const braced = (...parts: string[]) => {
  const inner = parts.filter(Boolean).join(",");
  return inner ? `{${inner}}` : "";
};

function header(name: string, type: string, help: string): string[] {
  return [`# HELP ${PREFIX}${name} ${help}`, `# TYPE ${PREFIX}${name} ${type}`];
}

export function renderCounter(name: string, help: string, series: Map<string, number>): string[] {
  const lines = [...series].map(([key, value]) => `${PREFIX}${name}${braced(key)} ${value}`);
  return [...header(name, "counter", help), ...lines];
}

function histogramLines(name: string, key: string, h: Histogram): string[] {
  const bucket = (le: string, value: number) =>
    `${PREFIX}${name}_bucket${braced(key, `le="${le}"`)} ${value}`;
  return [
    ...BUCKETS.map((bound, i) => bucket(String(bound), h.buckets[i] ?? 0)),
    bucket("+Inf", h.count),
    `${PREFIX}${name}_sum${braced(key)} ${h.sum}`,
    `${PREFIX}${name}_count${braced(key)} ${h.count}`,
  ];
}

export function renderHistogram(
  name: string,
  help: string,
  series: Map<string, Histogram>,
): string[] {
  const lines = [...series].flatMap(([key, h]) => histogramLines(name, key, h));
  return [...header(name, "histogram", help), ...lines];
}
