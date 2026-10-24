import { describe, expect, it } from "vitest";
import { aiKit, analysis, firstRecommendationId } from "../testing/ai";
import { signedInClient } from "../test-support";

describe("recommendations", () => {
  it("lets only the owner change a recommendation's status", async () => {
    const reviewed = await aiKit(() => analysis(["E1"]));
    const { client, container } = reviewed;
    const id = await firstRecommendationId(reviewed);
    const other = await signedInClient(container, "other@example.com");
    const body = JSON.stringify({ status: "done" });
    expect(
      (await other.request(`/ai/recommendations/${id}`, { method: "PATCH", body })).status,
    ).toBe(404);
    expect(
      (await client.request(`/ai/recommendations/${id}`, { method: "PATCH", body })).status,
    ).toBe(204);
  });
});

describe("recommendation status", () => {
  it("stamps a status change with the injected clock", async () => {
    const reviewed = await aiKit(() => analysis(["E1"]));
    const { client, container } = reviewed;
    const id = await firstRecommendationId(reviewed);
    container.setNow("2026-03-16T09:30:00Z");
    const body = JSON.stringify({ status: "accepted" });
    await client.request(`/ai/recommendations/${id}`, {
      method: "PATCH",
      body,
    });
    const row = container.db.prepare("SELECT updated_at FROM recommendations").get() as {
      updated_at: string;
    };
    expect(row.updated_at).toBe("2026-03-16T09:30:00.000Z");
  });
});

describe("demo data and AI output", () => {
  it("deletes AI insights and recommendations based on the demo when the demo is deleted", async () => {
    const { run, client, container } = await aiKit(() => analysis(["E1"]));
    await run("/ai/reviews/account");
    await client.request("/imports/demo", { method: "DELETE" });
    const rows = (table: string) =>
      (container.db.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as { n: number }).n;
    expect(rows("ai_insights")).toBe(0);
    expect(rows("recommendations")).toBe(0);
  });
});
