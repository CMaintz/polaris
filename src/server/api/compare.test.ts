import { strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { ANALYTICS_SHEETS, SHARES_CSV } from "../testing/linkedin-fixtures";
import { buildXlsx } from "../testing/xlsx";
import { type Client, importAndWait, signedInClient, testContainer } from "../test-support";

interface Row {
  account: { label: string; platform: string };
  kpis: { key: string; value: number | null; period: { from: string; to: string } }[];
}

const addAccount = (client: Client, label: string) =>
  client.request("/accounts", {
    method: "POST",
    body: JSON.stringify({ platform: "other", label }),
  });

async function compare(client: Client): Promise<Row[]> {
  const body = (await (await client.request("/analytics/compare?days=7")).json()) as {
    rows: Row[];
  };
  return body.rows;
}

const kpi = (row: Row | undefined, key: string) => row?.kpis.find((k) => k.key === key);

async function threeAccounts() {
  const container = testContainer();
  const client = await signedInClient(container);
  await importAndWait(container, client, {
    "Shares.csv": strToU8(SHARES_CSV),
    "Content.xlsx": buildXlsx(ANALYTICS_SHEETS),
  });
  await addAccount(client, "Blog");
  await importAndWait(container, client, { "posts.csv": strToU8("date,text\n2026-03-06,Hi\n") });
  await addAccount(client, "Empty");
  return { container, client };
}

describe("cross-account comparison", () => {
  it("gives one row per account, over the same period for every row", async () => {
    const { client } = await threeAccounts();
    const rows = await compare(client);
    expect(rows.map((r) => r.account.label)).toEqual(["LinkedIn", "Blog", "Empty"]);
    const periods = rows.map((r) => JSON.stringify(kpi(r, "posts")?.period));
    expect(new Set(periods).size).toBe(1);
    expect(kpi(rows[0], "impressions")?.value).toEqual(expect.any(Number));
    expect(kpi(rows[1], "posts")?.value).toBe(1);
  });

  it("shows missing data as null, never zero", async () => {
    const { client } = await threeAccounts();
    const [, blog, empty] = await compare(client);
    expect(kpi(blog, "impressions")?.value).toBeNull();
    expect(kpi(blog, "followers")?.value).toBeNull();
    expect(empty?.kpis.map((k) => k.value)).toEqual(empty?.kpis.map(() => null));
  });

  it("leaves out other users' accounts", async () => {
    const { container } = await threeAccounts();
    const other = await signedInClient(container, "other@example.com");
    expect(await compare(other)).toEqual([]);
  });
});
