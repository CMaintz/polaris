import { describe, expect, it } from "vitest";
import { InProcessTelemetry } from "./in-process-telemetry";

describe("InProcessTelemetry", () => {
  it("renders histogram buckets cumulatively, as Prometheus expects", () => {
    const telemetry = new InProcessTelemetry();
    const labels = { job_type: "import", outcome: "completed" };
    telemetry.observe("job_duration_seconds", labels, 0.03);
    telemetry.observe("job_duration_seconds", labels, 2);
    const text = telemetry.render();
    const series = 'job_type="import",outcome="completed"';
    expect(text).toContain(`polaris_job_duration_seconds_bucket{${series},le="0.05"} 1`);
    expect(text).toContain(`polaris_job_duration_seconds_bucket{${series},le="2.5"} 2`);
    expect(text).toContain(`polaris_job_duration_seconds_bucket{${series},le="+Inf"} 2`);
    expect(text).toContain(`polaris_job_duration_seconds_count{${series}} 2`);
    expect(text).toContain(`polaris_job_duration_seconds_sum{${series}} 2.03`);
  });

  it("counts the same labels as one series whatever order they were given in", () => {
    const telemetry = new InProcessTelemetry();
    telemetry.count("ai_calls_total", { provider: "openai", outcome: "failed" });
    telemetry.count("ai_calls_total", { outcome: "failed", provider: "openai" });
    expect(telemetry.render()).toContain(
      'polaris_ai_calls_total{outcome="failed",provider="openai"} 2',
    );
  });

  it("writes one JSON line per event with the duration in milliseconds", () => {
    const lines: string[] = [];
    const telemetry = new InProcessTelemetry((line) => lines.push(line));
    telemetry.log("job_finished", { job_type: "import", outcome: "failed" }, 0.25);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.endsWith("\n")).toBe(true);
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({
      event: "job_finished",
      job_type: "import",
      outcome: "failed",
      duration_ms: 250,
    });
  });
});
