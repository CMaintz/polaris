import { describe, expect, it } from "vitest";
import { type ImportBundle, type ImportedPost, emptyBundle } from "../../domain/content";
import { EMPTY_METRICS } from "../../domain/metrics";
import { SqliteAccountStore } from "../../infrastructure/db/account-store";
import { SqliteContentStore } from "../../infrastructure/db/content-store";
import { openDatabase } from "../../infrastructure/db/database";
import { SqliteJobRepository } from "../../infrastructure/db/job-repository";
import { SqliteRefreshTargets } from "../../infrastructure/db/refresh-targets";
import { PermanentJobError, ValidationError } from "../errors";
import type { Job } from "../jobs/ports";
import {
  type AnalyticsAccess,
  LINKEDIN_API,
  LinkedInApiError,
  type LinkedInAnalytics,
  type RefreshRequest,
} from "./ports";
import { MetricRefreshService } from "./refresh-service";

const NOW = "2026-03-15T12:00:00.000Z";

class FakeLinkedIn implements LinkedInAnalytics {
  requests: RefreshRequest[] = [];
  grant: AnalyticsAccess = "granted";
  answer: (request: RefreshRequest) => ImportBundle = () => emptyBundle(LINKEDIN_API);
  async access() {
    return this.grant;
  }
  async fetch(_accountId: string, request: RefreshRequest) {
    this.requests.push(request);
    return this.answer(request);
  }
}

function post(externalId: string, publishedAt: string): ImportedPost {
  return {
    externalId,
    url: null,
    text: null,
    publishedAt,
    timeKnown: true,
    contentType: "text",
    sourceMetadata: {},
  };
}

async function setup() {
  const db = openDatabase(":memory:");
  db.prepare(
    "INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES ('u', 'a@x', 'h', ?, ?)",
  ).run(NOW, NOW);
  const accounts = new SqliteAccountStore(db);
  const content = new SqliteContentStore(db);
  const jobs = new SqliteJobRepository(db);
  const linkedin = new FakeLinkedIn();
  const service = new MetricRefreshService({
    analytics: linkedin,
    targets: new SqliteRefreshTargets(db),
    content,
    accounts,
    jobs,
    clock: () => new Date(NOW),
    recentPostDays: 30,
  });
  const account = await accounts.create("u", { platform: "linkedin", label: "Ada" }, NOW);
  const seed = (bundle: Partial<ImportBundle>, on = account) =>
    content.applyBundle(on, { ...emptyBundle("linkedin-data-export"), ...bundle }, "seed", NOW);
  const run = async (accountId = account.id) => {
    const job = await jobs.enqueue({ userId: "u", type: "x", payload: { accountId } }, NOW);
    return service.run(job as Job);
  };
  return { db, accounts, service, linkedin, account, seed, run };
}

const figures = (externalId: string, impressions: number) => ({
  externalId,
  observedOn: "2026-03-15",
  metrics: { ...EMPTY_METRICS, impressions },
  period: null,
});

describe("metric refresh job", () => {
  it("writes to the account the job was started for, not the active one", async () => {
    const { db, accounts, linkedin, account, seed, run } = await setup();
    const other = await accounts.create("u", { platform: "linkedin", label: "Bo" }, NOW);
    await seed({ posts: [post("urn:li:share:1", "2026-03-10T09:00:00Z")] });
    await seed({ posts: [post("urn:li:share:1", "2026-03-10T09:00:00Z")] }, other);
    await accounts.activate("u", other.id);
    linkedin.answer = () => ({
      ...emptyBundle(LINKEDIN_API),
      postMetrics: [figures("urn:li:share:1", 77)],
      accountDays: [
        { day: "2026-03-14", impressions: 9, followers: 5, newFollowers: 1, engagements: null },
      ],
    });
    await run(account.id);
    const snapshots = db
      .prepare(
        `SELECT p.account_id AS accountId, m.impressions FROM post_metric_snapshots m
         JOIN posts p ON p.id = m.post_id WHERE m.provider = 'linkedin-api'`,
      )
      .all();
    expect(snapshots).toEqual([{ accountId: account.id, impressions: 77 }]);
    expect(db.prepare("SELECT account_id AS a FROM account_metric_days").all()).toEqual([
      { a: account.id },
    ]);
  });

  it("asks for a bounded backfill first, then only the days after the last refreshed one", async () => {
    const { linkedin, run } = await setup();
    linkedin.answer = () => ({
      ...emptyBundle(LINKEDIN_API),
      accountDays: [
        { day: "2026-03-10", impressions: 5, followers: 9, newFollowers: 1, engagements: null },
        // A follower total without impressions is not a refreshed day.
        { day: "2026-03-13", impressions: null, followers: 9, newFollowers: 0, engagements: null },
      ],
    });
    await run();
    await run();
    expect(linkedin.requests.map((r) => r.days)).toEqual([
      { from: "2025-12-15", until: "2026-03-15" },
      { from: "2026-03-11", until: "2026-03-15" },
    ]);
  });

  it("refreshes recent and never-refreshed API posts only, never activity or demo posts", async () => {
    const { linkedin, seed, run, account, db } = await setup();
    await seed({
      posts: [
        post("urn:li:share:1", "2026-03-10T09:00:00Z"),
        post("urn:li:ugcPost:2", "2025-01-01T09:00:00Z"),
        post("urn:li:share:3", "2025-01-02T09:00:00Z"),
        post("urn:li:activity:4", "2026-03-11T09:00:00Z"),
      ],
    });
    await seed({ ...emptyBundle(LINKEDIN_API), postMetrics: [figures("urn:li:share:3", 1)] });
    await seed({ ...emptyBundle("demo", "demo"), posts: [post("urn:li:share:5", NOW)] });
    await run();
    expect(linkedin.requests[0]?.posts).toEqual(["urn:li:share:1", "urn:li:ugcPost:2"]);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM posts WHERE account_id = ?").get(account.id),
    ).toEqual({ n: 4 });
  });

  it("fails for good with a reconnect message when LinkedIn rejects the sign-in", async () => {
    const { linkedin, run } = await setup();
    linkedin.answer = () => {
      throw new LinkedInApiError("LinkedIn rejected the stored sign-in", "reconnect");
    };
    const error = await run().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PermanentJobError);
    expect((error as Error).message).toMatch(/reconnect LinkedIn/i);
  });

  it("leaves outages and rate limits retryable", async () => {
    const { linkedin, run } = await setup();
    linkedin.answer = () => {
      throw new LinkedInApiError("LinkedIn is unavailable right now (429)", "unavailable");
    };
    const error = await run().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(PermanentJobError);
  });

  it("refuses an account of another platform", async () => {
    const { accounts, linkedin, run } = await setup();
    const blog = await accounts.create("u", { platform: "other", label: "Blog" }, NOW);
    expect(await run(blog.id).catch((e: unknown) => e)).toBeInstanceOf(PermanentJobError);
    expect(linkedin.requests).toEqual([]);
  });
});

describe("starting a refresh", () => {
  it("is offered only when LinkedIn granted the statistics scopes", async () => {
    const { service, linkedin } = await setup();
    linkedin.grant = "missing_scopes";
    expect((await service.status("u")).state).toBe("missing_scopes");
    expect(await service.start("u").catch((e: unknown) => e)).toBeInstanceOf(ValidationError);
    linkedin.grant = "granted";
    expect((await service.start("u")).payload).toMatchObject({ accountId: expect.any(String) });
  });

  it("is refused on an account of another platform", async () => {
    const { service, accounts } = await setup();
    const blog = await accounts.create("u", { platform: "other", label: "Blog" }, NOW);
    await accounts.activate("u", blog.id);
    expect((await service.status("u")).state).toBe("not_linkedin");
    expect(await service.start("u").catch((e: unknown) => e)).toBeInstanceOf(ValidationError);
  });

  it("says how many of the account's posts LinkedIn's API can refresh", async () => {
    const { service, seed } = await setup();
    await seed({
      posts: [
        post("urn:li:share:1", NOW),
        post("urn:li:activity:2", NOW),
        post("urn:li:activity:3", NOW),
      ],
    });
    expect(await service.status("u")).toMatchObject({ refreshablePosts: 1, totalPosts: 3 });
  });
});
