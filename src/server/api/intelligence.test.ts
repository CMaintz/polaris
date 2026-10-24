import { describe, expect, it } from "vitest";
import { signedInClient, testContainer } from "../test-support";

describe("scheduled intelligence in the running app", () => {
  it("runs a due schedule from the worker loop, once", async () => {
    const container = testContainer(
      {},
      { feedFetcher: { fetch: async () => ({ title: "", items: [] }) } },
    );
    const client = await signedInClient(container);
    await client.request("/imports/demo", { method: "POST" });
    const created = await client.request("/intelligence/schedules", {
      method: "POST",
      body: JSON.stringify({ kind: "feed_refresh", cadence: "daily" }),
    });
    expect(created.status).toBe(201);

    await container.worker.drain();
    await container.worker.drain();

    const runs = await container.jobs.listForUser(client.userId, "intelligence.feed_refresh", 5);
    expect(runs.map((j) => j.status)).toEqual(["completed"]);
  });
});
