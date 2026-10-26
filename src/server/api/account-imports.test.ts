import { strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { SHARES_CSV } from "../testing/linkedin-fixtures";
import {
  type Client,
  type TestContainer,
  importAndWait,
  signedInClient,
  testContainer,
  uploadFiles,
} from "../test-support";

// Aliased, oddly cased headers on purpose: "Published At" for date, "CONTENT" for text.
const GENERIC_CSV = [
  "Published At,CONTENT,url,Type,Impressions,Likes,Comments,Reposts,Hashtags",
  '2026-03-02,"Hello, world",https://blog.example.com/p/hello/,article,1200,30,4,2,"Craft; #writing"',
  '2026-03-05 09:30,"A post without a link",,,,,,,',
  ',"No date, skipped",,,,,,,',
].join("\r\n");

const generic = () => ({ "posts.csv": strToU8(GENERIC_CSV) });

async function blogClient() {
  const container = testContainer();
  const client = await signedInClient(container);
  const response = await client.request("/accounts", {
    method: "POST",
    body: JSON.stringify({ platform: "other", label: "Blog" }),
  });
  const { account } = (await response.json()) as { account: { id: string } };
  return { container, client, blogId: account.id };
}

const rows = (container: TestContainer, sql: string, ...params: unknown[]) =>
  container.db.prepare(sql).all(...params);

const errorOf = async (response: Response) =>
  ((await response.json()) as { error: { message: string } }).error.message;

async function postsPerAccount(container: TestContainer, client: Client) {
  return rows(
    container,
    `SELECT a.label, COUNT(p.id) AS n FROM accounts a LEFT JOIN posts p ON p.account_id = a.id
     WHERE a.user_id = ? GROUP BY a.id ORDER BY a.created_at, a.rowid`,
    client.userId,
  );
}

describe("imports into the active account", () => {
  it("refuses a LinkedIn export for a non-LinkedIn account before queueing it", async () => {
    const { container, client } = await blogClient();
    const response = await uploadFiles(container, client, { "Shares.csv": strToU8(SHARES_CSV) });
    expect(response.status).toBe(400);
    expect(await errorOf(response)).toMatch(/LinkedIn.*"Blog"/);
    expect(rows(container, "SELECT id FROM jobs")).toEqual([]);
  });

  it("refuses a generic posts CSV for a LinkedIn account", async () => {
    const container = testContainer();
    const client = await signedInClient(container);
    const response = await uploadFiles(container, client, generic());
    expect(response.status).toBe(400);
    expect(await errorOf(response)).toMatch(/Other/);
  });

  it("refuses demo data for a non-LinkedIn account", async () => {
    const { client } = await blogClient();
    const response = await client.request("/imports/demo", { method: "POST" });
    expect(response.status).toBe(400);
  });

  it("writes into the account that was active when the import started", async () => {
    const container = testContainer();
    const client = await signedInClient(container);
    expect(
      (await uploadFiles(container, client, { "Shares.csv": strToU8(SHARES_CSV) })).status,
    ).toBe(202);
    await client.request("/accounts", {
      method: "POST",
      body: JSON.stringify({ platform: "other", label: "Blog" }),
    });
    await container.worker.drain();
    expect(await postsPerAccount(container, client)).toEqual([
      { label: "LinkedIn", n: 2 },
      { label: "Blog", n: 0 },
    ]);
  });
});

describe("generic posts CSV", () => {
  it("imports posts with their metrics and hashtags, and leaves unknown values null", async () => {
    const { container, client } = await blogClient();
    const job = await importAndWait(container, client, generic());
    expect(job.status).toBe("completed");
    const posts = rows(
      container,
      `SELECT p.text, p.content_type, p.time_known, m.impressions, m.reactions, m.engagements
       FROM posts p LEFT JOIN post_metric_snapshots m ON m.post_id = p.id ORDER BY p.published_at`,
    );
    expect(posts).toEqual([
      {
        text: "Hello, world",
        content_type: "article",
        time_known: 0,
        impressions: 1200,
        reactions: 30,
        engagements: null,
      },
      {
        text: "A post without a link",
        content_type: "unknown",
        time_known: 1,
        impressions: null,
        reactions: null,
        engagements: null,
      },
    ]);
    expect(rows(container, "SELECT name FROM topics ORDER BY name")).toEqual([
      { name: "craft" },
      { name: "writing" },
    ]);
    expect(JSON.stringify(job.result)).toContain("row 4");
  });

  it("tells apart posts whose links differ only in the query string", async () => {
    const { container, client } = await blogClient();
    const csv = [
      "date,text,url",
      "2026-03-02,One,https://b.example/?p=1",
      "2026-03-03,Two,https://b.example/?p=2",
    ].join("\n");
    await importAndWait(container, client, { "posts.csv": strToU8(csv) });
    expect(await postsPerAccount(container, client)).toEqual([{ label: "Blog", n: 2 }]);
  });

  it("is idempotent, including for posts without a URL", async () => {
    const { container, client } = await blogClient();
    await importAndWait(container, client, generic());
    const crlfFree = GENERIC_CSV.replace(/\r\n/g, "\n");
    const job = await importAndWait(container, client, { "posts.csv": strToU8(crlfFree) });
    expect(job.result).toMatchObject({
      files: [{ posts: { added: 0, changed: 0, unchanged: 2 } }],
    });
    expect(await postsPerAccount(container, client)).toEqual([{ label: "Blog", n: 2 }]);
  });

  it("counts as a full listing, so posts published is measured rather than unknown", async () => {
    const { container, client } = await blogClient();
    await importAndWait(container, client, generic());
    const body = (await (await client.request("/dashboard?days=7")).json()) as {
      kpis: { key: string; value: number | null }[];
    };
    expect(body.kpis.find((k) => k.key === "posts")?.value).toBe(2);
  });
});
