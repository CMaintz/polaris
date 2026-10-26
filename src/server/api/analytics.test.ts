import { strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import type { DashboardDto, PostDetailDto, PostPageDto } from "../../shared/api-types";
import { ANALYTICS_SHEETS, POST_1, POST_2, POST_3, SHARES_CSV } from "../testing/linkedin-fixtures";
import { buildXlsx } from "../testing/xlsx";
import { type TestContainer, signedInClient, testContainer } from "../test-support";

async function withFixtureData(container: TestContainer, email = "ada@example.com") {
  const client = await signedInClient(container, email);
  const form = new FormData();
  form.append("files", new File([new Uint8Array(strToU8(SHARES_CSV))], "Shares.csv"));
  form.append("files", new File([new Uint8Array(buildXlsx(ANALYTICS_SHEETS))], "Content.xlsx"));
  await container.api.request("/imports", {
    method: "POST",
    headers: { cookie: client.cookie, origin: "http://localhost" },
    body: form,
  });
  await container.worker.drain();
  return client;
}

const idOf = (container: TestContainer, externalId: string) =>
  (
    container.db.prepare("SELECT id FROM posts WHERE external_id = ?").get(externalId) as {
      id: string;
    }
  ).id;

describe("dashboard", () => {
  it("shows unknown, not zero, before anything is imported", async () => {
    const container = testContainer();
    const client = await signedInClient(container);
    const dashboard = (await (await client.request("/dashboard")).json()) as DashboardDto;
    expect(dashboard.status.asOf).toBeNull();
    expect(dashboard.kpis.map((k) => k.value)).toEqual([null, null, null, null, null]);
  });

  it("computes KPIs over the period ending at the latest data, with coverage and source", async () => {
    const container = testContainer();
    const client = await withFixtureData(container);
    const dashboard = (await (await client.request("/dashboard?days=7")).json()) as DashboardDto;
    expect(dashboard.status.asOf).toBe("2026-03-07");
    const kpi = Object.fromEntries(dashboard.kpis.map((k) => [k.key, k]));
    // ENGAGEMENT sheet: 700 + 900 impressions, 3/3 blank; 20 + 31 engagements.
    expect(kpi["impressions"]).toMatchObject({
      value: 1600,
      period: { from: "2026-03-01", to: "2026-03-07" },
      coverage: { observedDays: 2, totalDays: 7 },
      source: "LinkedIn analytics export",
    });
    expect(kpi["engagement_rate"]?.value).toBeCloseTo(51 / 1600);
    expect(kpi["followers"]?.value).toBe(1250);
    // Only archive posts count, and only inside the archive's range (3/2 to 3/4).
    expect(kpi["posts"]).toMatchObject({ value: 2, coverage: { observedDays: 3, totalDays: 7 } });
  });
});

describe("metrics across imports", () => {
  it("keeps values an earlier export reported when a later one omits them", async () => {
    const container = testContainer();
    const client = await withFixtureData(container);
    const later = {
      DISCOVERY: [["Overall Performance", "3/8/2026 - 3/14/2026"]],
      "TOP POSTS": [
        ["Post URL", "Post publish date", "Engagements"],
        [`https://www.linkedin.com/feed/update/${POST_1}/`, "3/2/2026", 55],
      ],
    };
    const form = new FormData();
    form.append("files", new File([new Uint8Array(buildXlsx(later))], "Later.xlsx"));
    await container.api.request("/imports", {
      method: "POST",
      headers: { cookie: client.cookie, origin: "http://localhost" },
      body: form,
    });
    await container.worker.drain();
    const detail = (await (
      await client.request(`/posts/${idOf(container, POST_1)}`)
    ).json()) as PostDetailDto;
    expect(detail.post.metrics).toMatchObject({ engagements: 55, impressions: 1500 });
    expect(detail.post.metricsObservedOn).toBe("2026-03-14");
  });

  it("reports posts published as unknown when only the analytics export was imported", async () => {
    const container = testContainer();
    const client = await signedInClient(container);
    const form = new FormData();
    form.append("files", new File([new Uint8Array(buildXlsx(ANALYTICS_SHEETS))], "Content.xlsx"));
    await container.api.request("/imports", {
      method: "POST",
      headers: { cookie: client.cookie, origin: "http://localhost" },
      body: form,
    });
    await container.worker.drain();
    const dashboard = (await (await client.request("/dashboard?days=7")).json()) as DashboardDto;
    expect(dashboard.kpis.find((k) => k.key === "posts")?.value).toBeNull();
  });
});

describe("content explorer", () => {
  it("filters by topic, merging #AI spellings across old and new exports", async () => {
    const container = testContainer();
    const client = await withFixtureData(container);
    const page = (await (await client.request("/posts?topic=ai")).json()) as PostPageDto;
    expect(page.items.map((p) => p.id).sort()).toEqual(
      [idOf(container, POST_1), idOf(container, POST_2)].sort(),
    );
  });

  it("sorts by a metric with unknown values last in either direction", async () => {
    const container = testContainer();
    const client = await withFixtureData(container);
    for (const dir of ["asc", "desc"]) {
      const page = (await (
        await client.request(`/posts?sort=engagements&dir=${dir}`)
      ).json()) as PostPageDto;
      expect(page.items.at(-1)?.metrics.engagements).toBeNull();
    }
  });

  it("validates query parameters", async () => {
    const container = testContainer();
    const client = await signedInClient(container);
    expect((await client.request("/posts?limit=1000")).status).toBe(400);
    expect((await client.request("/posts?from=March")).status).toBe(400);
  });
});

describe("post detail", () => {
  it("shows every observation with its source and covered period", async () => {
    const container = testContainer();
    const client = await withFixtureData(container);
    const detail = (await (
      await client.request(`/posts/${idOf(container, POST_3)}`)
    ).json()) as PostDetailDto;
    expect(detail.post.text).toBeNull();
    expect(detail.observations).toEqual([
      {
        observedOn: "2026-03-07",
        source: "LinkedIn analytics export",
        metrics: expect.objectContaining({ engagements: 35, impressions: 2100 }),
        period: { from: "2026-03-01", to: "2026-03-07" },
      },
    ]);
  });

  it("does not show one user's post to another", async () => {
    const container = testContainer();
    await withFixtureData(container, "owner@example.com");
    const other = await signedInClient(container, "other@example.com");
    expect((await other.request(`/posts/${idOf(container, POST_1)}`)).status).toBe(404);
  });
});

describe("timeseries", () => {
  it("counts zero-post days as zero inside the imported range", async () => {
    const container = testContainer();
    const client = await withFixtureData(container);
    const response = await client.request(
      "/analytics/timeseries?metric=posts&from=2026-03-01&to=2026-03-05",
    );
    const { points } = (await response.json()) as { points: { value: number | null }[] };
    // Archive posts on 3/2 and 3/4; 3/5 is an analytics-only post outside the archive's range.
    expect(points.map((p) => p.value)).toEqual([null, 1, 0, 1, null]);
  });
});
