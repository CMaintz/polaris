/**
 * The only label names a metric or log line may carry. Every value must come from a small
 * fixed set (a route pattern, a job type, an outcome), never from user data, so the series
 * count stays bounded and nothing personal leaves the process (docs/09).
 */
export const LABEL_NAMES = [
  "method",
  "route",
  "status",
  "job_type",
  "outcome",
  "provider",
] as const;

type LabelName = (typeof LABEL_NAMES)[number];

export type Labels = Partial<Record<LabelName, string>>;

export type CounterName = "http_requests_total" | "jobs_total" | "ai_calls_total";

/** Histograms observe durations in seconds. */
export type HistogramName = "http_request_duration_seconds" | "job_duration_seconds";

export type EventName = "job_finished" | "request_failed";

export interface Telemetry {
  count(metric: CounterName, labels: Labels): void;
  observe(metric: HistogramName, labels: Labels, seconds: number): void;
  /** One structured line per event; carries only labels and a duration, never free text. */
  log(event: EventName, labels: Labels, seconds: number): void;
}

export const noopTelemetry: Telemetry = {
  count: () => {},
  observe: () => {},
  log: () => {},
};

/** Monotonic, so a wall-clock jump (or a test's fake clock) cannot skew a duration. */
export function startTimer(): () => number {
  const started = performance.now();
  return () => (performance.now() - started) / 1000;
}
