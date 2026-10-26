import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config";
import { InProcessTelemetry } from "../infrastructure/telemetry/in-process-telemetry";
import { signedInClient, testContainer } from "../test-support";
import { errorResponse } from "./http";
import { requestTelemetry } from "./request-telemetry";

const TOKEN = "s3cret-scrape-token";

const scrape = (container: ReturnType<typeof testContainer>, authorization?: string) =>
  container.api.request("/metrics", {
    headers: authorization ? { authorization } : {},
  });

describe("GET /metrics", () => {
  it("does not exist unless a token is configured", async () => {
    const container = testContainer();
    expect((await scrape(container, `Bearer ${TOKEN}`)).status).toBe(404);
  });

  it("treats an empty POLARIS_METRICS_TOKEN as unset", () => {
    expect(loadConfig({ POLARIS_METRICS_TOKEN: "" }).metricsToken).toBeUndefined();
    expect(loadConfig({ POLARIS_METRICS_TOKEN: TOKEN }).metricsToken).toBe(TOKEN);
  });

  it("rejects a missing, wrong or merely prefixed token", async () => {
    const container = testContainer({ metricsToken: TOKEN });
    for (const header of [
      undefined,
      "Bearer wrong",
      `Bearer ${TOKEN}x`,
      `Bearer ${TOKEN.slice(1)}`,
    ]) {
      expect((await scrape(container, header)).status).toBe(401);
    }
    expect((await scrape(container, TOKEN)).status).toBe(401);
  });

  it("serves Prometheus text to the right token", async () => {
    const container = testContainer({ metricsToken: TOKEN });
    await container.api.request("/health");
    const response = await scrape(container, `Bearer ${TOKEN}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain; version=0.0.4");
    expect(await response.text()).toContain(
      'polaris_http_requests_total{method="GET",route="/health",status="2xx"} 1',
    );
  });
});

describe("job telemetry", () => {
  it("exposes the jobs the running worker finished", async () => {
    const container = testContainer({ metricsToken: TOKEN });
    const client = await signedInClient(container);
    await client.request("/imports/demo", { method: "POST" });
    await container.worker.drain();
    const text = await (await scrape(container, `Bearer ${TOKEN}`)).text();
    expect(text).toMatch(/polaris_jobs_total\{job_type="[a-z_-]+",outcome="completed"\} 1/);
  });
});

describe("request telemetry", () => {
  it("labels requests by route pattern, never by the raw path with its ids", async () => {
    const container = testContainer({ metricsToken: TOKEN });
    const client = await signedInClient(container);
    const id = "5b0c9d7e-3f6a-4e21-9a8b-1c2d3e4f5a6b";
    await client.request(`/jobs/${id}`);
    await client.request(`/no-such-route/${id}`);
    const text = await (await scrape(container, `Bearer ${TOKEN}`)).text();
    expect(text).toContain('route="/jobs/:id",status="4xx"');
    expect(text).toContain('route="unmatched"');
    expect(text).not.toContain(id);
  });

  it("logs a failed request by its route pattern, without the path or the error", async () => {
    const lines: string[] = [];
    const app = new Hono();
    app.onError((error, c) => errorResponse(c, error));
    app.use(requestTelemetry(new InProcessTelemetry((line) => lines.push(line))));
    app.get("/posts/:id", () => {
      throw new Error("constraint failed for ada@example.com");
    });
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    await app.request("/posts/post-123");
    quiet.mockRestore();
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({
      event: "request_failed",
      route: "/posts/:id",
      status: "5xx",
    });
    expect(lines[0]).not.toMatch(/post-123|ada@example/);
  });
});
