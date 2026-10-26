import type {
  CounterName,
  EventName,
  HistogramName,
  Labels,
  Telemetry,
} from "../../application/telemetry/ports";
import {
  BUCKETS,
  CONTENT_TYPE,
  type Histogram,
  renderCounter,
  renderHistogram,
  seriesKey,
} from "./exposition";

const COUNTER_HELP: Record<CounterName, string> = {
  http_requests_total: "API requests by method, route pattern and status class.",
  jobs_total: "Job attempts by type and outcome.",
  ai_calls_total: "AI provider calls by provider and outcome.",
};

const HISTOGRAM_HELP: Record<HistogramName, string> = {
  http_request_duration_seconds: "API request duration in seconds.",
  job_duration_seconds: "Job attempt duration in seconds.",
};

const writeStdout = (line: string) => void process.stdout.write(line);

/**
 * Keeps metrics in memory for a single process, which is all a self-hosted install runs.
 * They reset on restart; Prometheus counters are built to tolerate that.
 */
export class InProcessTelemetry implements Telemetry {
  private readonly counters = new Map<CounterName, Map<string, number>>();
  private readonly histograms = new Map<HistogramName, Map<string, Histogram>>();
  readonly contentType = CONTENT_TYPE;

  constructor(private readonly write: (line: string) => void = writeStdout) {}

  count(metric: CounterName, labels: Labels): void {
    const series = this.seriesOf(this.counters, metric);
    const key = seriesKey(labels);
    series.set(key, (series.get(key) ?? 0) + 1);
  }

  observe(metric: HistogramName, labels: Labels, seconds: number): void {
    const series = this.seriesOf(this.histograms, metric);
    const key = seriesKey(labels);
    const h = series.get(key) ?? { buckets: BUCKETS.map(() => 0), sum: 0, count: 0 };
    BUCKETS.forEach((bound, i) => {
      if (seconds <= bound) h.buckets[i] = (h.buckets[i] ?? 0) + 1;
    });
    h.sum += seconds;
    h.count += 1;
    series.set(key, h);
  }

  log(event: EventName, labels: Labels, seconds: number): void {
    const time = new Date().toISOString();
    const durationMs = Math.round(seconds * 1000);
    this.write(`${JSON.stringify({ time, event, ...labels, duration_ms: durationMs })}\n`);
  }

  render(): string {
    const counters = [...this.counters].flatMap(([name, series]) =>
      renderCounter(name, COUNTER_HELP[name], series),
    );
    const histograms = [...this.histograms].flatMap(([name, series]) =>
      renderHistogram(name, HISTOGRAM_HELP[name], series),
    );
    return [...counters, ...histograms, ""].join("\n");
  }

  private seriesOf<K, V>(store: Map<K, Map<string, V>>, metric: K): Map<string, V> {
    const existing = store.get(metric);
    if (existing) return existing;
    const created = new Map<string, V>();
    store.set(metric, created);
    return created;
  }
}
