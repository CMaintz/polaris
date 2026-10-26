import { strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { ANALYTICS_SHEETS, POST_1, POST_3 } from "../testing/linkedin-fixtures";
import { buildXlsx } from "../testing/xlsx";
import {
  type Client,
  type TestContainer,
  importAndWait,
  signedInClient,
  testContainer,
} from "../test-support";

interface FinishedJob {
  id: string;
  status: string;
  completedAt: string | null;
  result: { files: Record<string, unknown>[] } | null;
}

const run = async (container: TestContainer, client: Client, files: Record<string, Uint8Array>) =>
  (await importAndWait(container, client, files)) as unknown as FinishedJob;

const snapshotJobs = (container: TestContainer) =>
  container.db
    .prepare(
      `SELECT p.external_id AS post, m.impressions, m.import_job_id AS job
       FROM post_metric_snapshots m JOIN posts p ON p.id = m.post_id ORDER BY p.external_id`,
    )
    .all();

const countRows = (container: TestContainer, table: string) =>
  (container.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

/** The analytics export with POST_3's impressions moved from 2100 to 2200. */
function bumpedSheets() {
  const sheets = structuredClone(ANALYTICS_SHEETS);
  const topPosts = sheets["TOP POSTS"] as (string | number | null)[][];
  const row = topPosts[3];
  if (!row) throw new Error("fixture changed: TOP POSTS row 4 missing");
  row[6] = 2200;
  return sheets;
}

async function otherAccount(client: Client, label: string) {
  const response = await client.request("/accounts", {
    method: "POST",
    body: JSON.stringify({ platform: "other", label }),
  });
  const { account } = (await response.json()) as { account: { id: string } };
  await client.request(`/accounts/${account.id}/activate`, { method: "POST" });
  return account.id;
}

const POSTS_CSV = strToU8(
  ["date,text,impressions", "2026-03-02,One,100", "2026-03-03,Two,200"].join("\n"),
);

describe("incremental re-import", () => {
  it("reports content it already holds as unchanged and leaves those snapshots alone", async () => {
    const container = testContainer();
    const client = await signedInClient(container);
    const first = await run(container, client, { "Content.xlsx": buildXlsx(ANALYTICS_SHEETS) });
    // An extra sheet changes the bytes but none of the data the importer reads.
    const reexport = buildXlsx({ ...ANALYTICS_SHEETS, NOTES: [["exported again"]] });
    const second = await run(container, client, { "Content.xlsx": reexport });
    expect(second.result?.files[0]).toMatchObject({
      alreadyImportedOn: null,
      posts: { added: 0, changed: 0, unchanged: 2 },
      metricSnapshots: { added: 0, changed: 0, unchanged: 2 },
    });
    expect(snapshotJobs(container)).toEqual([
      { post: POST_1, impressions: 1500, job: first.id },
      { post: POST_3, impressions: 2100, job: first.id },
    ]);
  });

  it("counts a changed figure from a file of the same name and moves only that snapshot", async () => {
    const container = testContainer();
    const client = await signedInClient(container);
    const first = await run(container, client, { "Content.xlsx": buildXlsx(ANALYTICS_SHEETS) });
    const second = await run(container, client, { "Content.xlsx": buildXlsx(bumpedSheets()) });
    expect(second.result?.files[0]).toMatchObject({
      alreadyImportedOn: null,
      metricSnapshots: { added: 0, changed: 1, unchanged: 1 },
    });
    expect(snapshotJobs(container)).toEqual([
      { post: POST_1, impressions: 1500, job: first.id },
      { post: POST_3, impressions: 2200, job: second.id },
    ]);
  });

  it("treats a figure missing from the re-import as unchanged, not as erased", async () => {
    const container = testContainer();
    const client = await signedInClient(container);
    await otherAccount(client, "Blog");
    const csv = (row: string) => ({ "posts.csv": strToU8(`date,text,impressions,likes\n${row}`) });
    const first = await run(container, client, csv("2026-03-02,One,100,5"));
    const second = await run(container, client, csv("2026-03-02,One,,5"));
    expect(second.result?.files[0]).toMatchObject({
      metricSnapshots: { added: 0, changed: 0, unchanged: 1 },
    });
    expect(snapshotJobs(container)).toEqual([
      { post: expect.any(String), impressions: 100, job: first.id },
    ]);
  });

  it("counts posts new to the account as added and edited posts as changed", async () => {
    const container = testContainer();
    const client = await signedInClient(container);
    await otherAccount(client, "Blog");
    await run(container, client, { "posts.csv": POSTS_CSV });
    const edited = [
      "date,text,type",
      "2026-03-02,One,article",
      "2026-03-03,Two,",
      "2026-03-04,Three,",
    ];
    const second = await run(container, client, { "posts.csv": strToU8(edited.join("\n")) });
    expect(second.result?.files[0]).toMatchObject({
      posts: { added: 1, changed: 1, unchanged: 1 },
    });
  });
});

describe("re-uploading a file that was already imported", () => {
  it("skips the identical bytes and says when they were first imported", async () => {
    const container = testContainer();
    const client = await signedInClient(container);
    await otherAccount(client, "Blog");
    const first = await run(container, client, { "posts.csv": POSTS_CSV });
    const snapshots = countRows(container, "post_metric_snapshots");
    // A day later the CSV's figures would be recorded again as that day's observation.
    container.setNow("2026-03-16T09:00:00Z");
    const second = await run(container, client, { "copy of posts.csv": POSTS_CSV });
    expect(second.status).toBe("completed");
    expect(second.result?.files).toEqual([
      expect.objectContaining({
        file: "copy of posts.csv",
        alreadyImportedOn: first.completedAt,
        posts: { added: 0, changed: 0, unchanged: 0 },
      }),
    ]);
    expect(countRows(container, "post_metric_snapshots")).toBe(snapshots);
  });

  it("imports the same bytes again when they are for a different account", async () => {
    const container = testContainer();
    const client = await signedInClient(container);
    await otherAccount(client, "Blog");
    await run(container, client, { "posts.csv": POSTS_CSV });
    await otherAccount(client, "Newsletter");
    const second = await run(container, client, { "posts.csv": POSTS_CSV });
    expect(second.result?.files[0]).toMatchObject({
      alreadyImportedOn: null,
      posts: { added: 2, changed: 0, unchanged: 0 },
    });
  });

  it("does not count an import that failed as a previous import", async () => {
    const container = testContainer();
    const client = await signedInClient(container);
    const broken = { "broken.xlsx": strToU8("not a zip") };
    expect((await run(container, client, broken)).status).toBe("failed");
    expect((await run(container, client, broken)).status).toBe("failed");
  });
});
