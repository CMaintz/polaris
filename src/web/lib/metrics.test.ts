import { describe, expect, it } from "vitest";
import { formatMetric, metricInputLabel, parseMetricInput } from "./metrics";

describe("metric input", () => {
  it("reads a typed rate as a percentage, so 3 means 3% and not 300%", () => {
    expect(parseMetricInput("engagement_rate", "3")).toBe(0.03);
    expect(parseMetricInput("engagements", "3")).toBe(3);
  });

  it("treats an empty input as no value, never as zero", () => {
    expect(parseMetricInput("engagement_rate", "")).toBeNull();
    expect(parseMetricInput("impressions", " ")).toBeNull();
  });

  it("marks rate inputs as percentages and leaves counts unmarked", () => {
    expect(metricInputLabel("engagement_rate", "Target")).toBe("Target (%)");
    expect(metricInputLabel("impressions", "Target")).toBe("Target");
  });

  it("shows a stored rate as a percentage", () => {
    expect(formatMetric("engagement_rate", 0.03)).toBe("3.00%");
    expect(formatMetric("engagements", 3)).toBe("3");
  });
});
