import { strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { ANALYTICS_SHEETS, POST_1, SHARES_CSV } from "../testing/linkedin-fixtures";
import { buildXlsx } from "../testing/xlsx";
import { type TestContainer, signedInClient, testContainer, uploadFiles } from "../test-support";

type Client = Awaited<ReturnType<typeof signedInClient>>;

async function importAndWait(
  container: TestContainer,
  client: Client,
  files: Record<string, Uint8Array>,
) {
  const response = await uploadFiles(container, client, files);
  expect(response.status).toBe(202);
  const { job } = (await response.json()) as { job: { id: string } };
  await container.worker.drain();
  const done = await (await client.request(`/jobs/${job.id}`)).json();
  return (done as { job: { status: string; error: string | null; result: unknown } }).job;
}

const count = (container: TestContainer, sql: string) =>
  (container.db.prepare(sql).get() as { n: number }).n;

const files = () => ({
  "Shares.csv": strToU8(SHARES_CSV),
  "Content_export.xlsx": buildXlsx(ANALYTICS_SHEETS),
});

describe("import pipeline", () => {
  it("imports both exports and attaches analytics to the archive's post by URN", async () => {
    const container = testContainer();
    const client = await signedInClient(container);
    const job = await importAndWait(container, client, files());
    expect(job.status).toBe("completed");
    const post = container.db
      .prepare(
        `SELECT p.text, p.time_known, p.providers, m.engagements, m.impressions
         FROM posts p JOIN post_metric_snapshots m ON m.post_id = p.id WHERE p.external_id = ?`,
      )
      .get(POST_1) as Record<string, unknown>;
    expect(post).toMatchObject({ time_known: 1, engagements: 40, impressions: 1500 });
    expect(String(post["text"])).toContain("Shipping notes");
    expect(JSON.parse(String(post["providers"]))).toEqual([
      "linkedin-data-export",
      "linkedin-analytics-export",
    ]);
  });

  it("is idempotent: importing the same files twice changes nothing", async () => {
    const container = testContainer();
    const client = await signedInClient(container);
    await importAndWait(container, client, files());
    const snapshot = () => ({
      posts: count(container, "SELECT COUNT(*) n FROM posts"),
      metrics: count(container, "SELECT COUNT(*) n FROM post_metric_snapshots"),
      days: count(container, "SELECT COUNT(*) n FROM account_metric_days"),
      audience: count(container, "SELECT COUNT(*) n FROM audience_segments"),
      topics: count(container, "SELECT COUNT(*) n FROM post_topics"),
    });
    const first = snapshot();
    const job = await importAndWait(container, client, files());
    expect(snapshot()).toEqual(first);
    expect(job.result).toMatchObject({ files: [{ postsCreated: 0 }, { postsCreated: 0 }] });
  });

  it("does not let a later date-only source overwrite a known publish time or text", async () => {
    const container = testContainer();
    const client = await signedInClient(container);
    await importAndWait(container, client, { "Shares.csv": strToU8(SHARES_CSV) });
    await importAndWait(container, client, { "Content.xlsx": buildXlsx(ANALYTICS_SHEETS) });
    const post = container.db
      .prepare("SELECT published_at, text, content_type FROM posts WHERE external_id = ?")
      .get(POST_1) as Record<string, string>;
    expect(post["published_at"]).toBe("2026-03-02T08:15:00.000Z");
    expect(post["text"]).toContain("Shipping notes");
    expect(post["content_type"]).toBe("text");
  });

  it("rejects unsupported files before queueing anything", async () => {
    const container = testContainer();
    const client = await signedInClient(container);
    const response = await uploadFiles(container, client, { "notes.txt": strToU8("hello") });
    expect(response.status).toBe(400);
    expect(count(container, "SELECT COUNT(*) n FROM jobs")).toBe(0);
  });

  it("rejects an oversized upload before reading it into memory", async () => {
    const container = testContainer({ maxUploadBytes: 1024 });
    const client = await signedInClient(container);
    const response = await uploadFiles(container, client, { "Shares.csv": new Uint8Array(4096) });
    expect(response.status).toBe(413);
    expect(count(container, "SELECT COUNT(*) n FROM import_files")).toBe(0);
  });

  it("fails without retrying when a file turns out to be unreadable", async () => {
    const container = testContainer();
    const client = await signedInClient(container);
    const job = await importAndWait(container, client, { "broken.xlsx": strToU8("not a zip") });
    expect(job).toMatchObject({
      status: "failed",
      error: "broken.xlsx is not a readable Excel workbook",
    });
  });

  it("keeps each user's imported data to themselves", async () => {
    const container = testContainer();
    const owner = await signedInClient(container, "owner@example.com");
    const other = await signedInClient(container, "other@example.com");
    await importAndWait(container, owner, files());
    const status = (await (await other.request("/imports/status")).json()) as {
      hasLinkedInData: boolean;
    };
    expect(status.hasLinkedInData).toBe(false);
  });
});

describe("demo data", () => {
  it("loads a labelled demo dataset and deletes it when real data arrives", async () => {
    const container = testContainer();
    const client = await signedInClient(container);
    await client.request("/imports/demo", { method: "POST" });
    await container.worker.drain();
    expect(await (await client.request("/imports/status")).json()).toMatchObject({
      hasDemoData: true,
      hasLinkedInData: false,
    });
    await importAndWait(container, client, files());
    expect(await (await client.request("/imports/status")).json()).toMatchObject({
      hasDemoData: false,
      hasLinkedInData: true,
    });
    expect(count(container, "SELECT COUNT(*) n FROM posts WHERE dataset = 'demo'")).toBe(0);
  });

  it("refuses to mix demo data into an account with real data", async () => {
    const container = testContainer();
    const client = await signedInClient(container);
    await importAndWait(container, client, files());
    const response = await client.request("/imports/demo", { method: "POST" });
    expect(response.status).toBe(409);
  });

  it("does not write demo data if real data arrived while the demo job was queued", async () => {
    const container = testContainer();
    const client = await signedInClient(container);
    await importAndWait(container, client, files());
    const demo = await container.jobs.enqueue(
      { userId: client.userId, type: "import", payload: { demo: true } },
      container.clock().toISOString(),
    );
    await container.worker.drain();
    expect(await container.jobs.findForUser(client.userId, demo.id)).toMatchObject({
      status: "failed",
    });
    expect(count(container, "SELECT COUNT(*) n FROM posts WHERE dataset = 'demo'")).toBe(0);
  });

  it("can be deleted on request", async () => {
    const container = testContainer();
    const client = await signedInClient(container);
    await client.request("/imports/demo", { method: "POST" });
    await container.worker.drain();
    await client.request("/imports/demo", { method: "DELETE" });
    expect(count(container, "SELECT COUNT(*) n FROM posts")).toBe(0);
    expect(count(container, "SELECT COUNT(*) n FROM account_metric_days")).toBe(0);
  });
});

describe("import job payloads", () => {
  it("fails a job whose payload does not parse instead of guessing", async () => {
    const container = testContainer();
    const client = await signedInClient(container);
    const job = await container.jobs.enqueue(
      { userId: client.userId, type: "import", payload: { demo: "yes" } },
      container.clock().toISOString(),
    );
    await container.worker.drain();
    expect(await container.jobs.findForUser(client.userId, job.id)).toMatchObject({
      status: "failed",
      retryCount: 0,
    });
    expect(count(container, "SELECT COUNT(*) n FROM posts")).toBe(0);
  });
});
