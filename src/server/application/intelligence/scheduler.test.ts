import { beforeEach, describe, expect, it } from "vitest";
import { SqliteJobRepository } from "../../infrastructure/db/job-repository";
import type { Db } from "../../infrastructure/db/database";
import { SqliteScheduleStore } from "../../infrastructure/intelligence/sqlite-schedules";
import { AI_JOB } from "../ai/ai-service";
import { RESEARCH_JOB, TREND_DIGEST_JOB } from "./jobs";
import { Scheduler } from "./scheduler";
import { addAccount, intelligenceDb } from "../../testing/intelligence";
import type { ScheduleInput } from "../../../shared/intelligence-types";

const START = "2026-03-15T12:00:00.000Z";
const at = (iso: string) => new Date(iso);

let db: Db;
let jobs: SqliteJobRepository;
let store: SqliteScheduleStore;
let scheduler: Scheduler;
let account: { userId: string; accountId: string };

beforeEach(() => {
  db = intelligenceDb();
  jobs = new SqliteJobRepository(db);
  store = new SqliteScheduleStore(db);
  scheduler = new Scheduler(store, jobs);
  account = addAccount(db);
});

const create = (input: ScheduleInput, nextRunAt = START) =>
  store.create(account.accountId, { ...input, nextRunAt }, START);

const queued = () => jobs.listForUser(account.userId);

describe("Scheduler.tick", () => {
  it("enqueues a due schedule once, however often it ticks", async () => {
    await create({ kind: "trend_digest", cadence: "daily", params: { withAi: false } });
    expect(await scheduler.tick(at(START))).toBe(1);
    expect(await scheduler.tick(at(START))).toBe(0);
    const [job] = await queued();
    expect(job).toMatchObject({
      type: TREND_DIGEST_JOB,
      payload: { accountId: account.accountId, withAi: false },
    });
  });

  it("skips a run while the previous one is still waiting, and resumes once it finishes", async () => {
    await create({ kind: "trend_digest", cadence: "daily", params: {} });
    await scheduler.tick(at(START));
    expect(await scheduler.tick(at("2026-03-17T12:00:00.000Z"))).toBe(0);
    const [job] = await queued();
    await jobs.complete(job?.id ?? "", null, "2026-03-17T12:00:00.000Z");
    expect(await scheduler.tick(at("2026-03-17T12:00:01.000Z"))).toBe(1);
    expect(await queued()).toHaveLength(2);
  });

  it("ignores disabled schedules and schedules that are not due yet", async () => {
    const off = await create({ kind: "feed_refresh", cadence: "daily", params: {} });
    await store.update(account.accountId, off.id, { enabled: false }, START);
    await create(
      { kind: "feed_refresh", cadence: "daily", params: {} },
      "2026-03-16T00:00:00.000Z",
    );
    expect(await scheduler.tick(at(START))).toBe(0);
  });

  it("runs once after a long outage and plans the next run from now, not from the backlog", async () => {
    const schedule = await create({ kind: "feed_refresh", cadence: "weekly", params: {} });
    expect(await scheduler.tick(at("2026-05-01T09:00:00.000Z"))).toBe(1);
    const after = await store.get(account.accountId, schedule.id);
    expect(after).toMatchObject({
      nextRunAt: "2026-05-08T09:00:00.000Z",
      lastRunAt: "2026-05-01T09:00:00.000Z",
    });
  });

  it("enqueues the existing AI account review job for a weekly review", async () => {
    await create({ kind: "account_review", cadence: "weekly", params: { tz: 60 } });
    await scheduler.tick(at(START));
    const [job] = await queued();
    expect(job).toMatchObject({
      type: AI_JOB,
      payload: { task: "account_review", tz: 60, label: "Account review" },
    });
  });

  it("re-runs a research question for the same peer", async () => {
    await create({
      kind: "research_rerun",
      cadence: "weekly",
      params: { question: "What changed?", peerId: null },
    });
    await scheduler.tick(at(START));
    const [job] = await queued();
    expect(job).toMatchObject({
      type: RESEARCH_JOB,
      payload: { accountId: account.accountId, question: "What changed?", peerId: null },
    });
  });
});
