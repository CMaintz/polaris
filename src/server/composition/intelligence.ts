import type { JobHandler } from "../application/jobs/ports";
import { FeedService } from "../application/intelligence/feed-service";
import { FEED_REFRESH_JOB, RESEARCH_JOB, TREND_DIGEST_JOB } from "../application/intelligence/jobs";
import { PeerService } from "../application/intelligence/peer-service";
import type { Clock } from "../application/clock";
import type { ResolveAccount } from "../application/content/ports";
import type { PostSource } from "../application/intelligence/context";
import type { FeedFetcher } from "../application/intelligence/feed-ports";
import type {
  InteractionRecorder,
  KeySource,
  ProviderSource,
} from "../application/intelligence/ports";
import type {
  Peer,
  PeerStore,
  WebResearchFactory,
} from "../application/intelligence/research-ports";
import type { JobRepository } from "../application/jobs/ports";
import type { Db } from "../infrastructure/db/database";
import { ResearchService } from "../application/intelligence/research-service";
import { type ScheduleGuards, ScheduleService } from "../application/intelligence/schedule-service";
import { Scheduler } from "../application/intelligence/scheduler";
import { TrendService } from "../application/intelligence/trend-service";
import { SqliteFeedStore } from "../infrastructure/db/intelligence-store";
import { SqliteRecordTable } from "../infrastructure/db/record-table";
import { HttpFeedFetcher } from "../infrastructure/intelligence/http-feed-fetcher";
import { createWebResearch } from "../infrastructure/intelligence/research-factory";
import {
  SqliteDigestStore,
  SqliteReportStore,
} from "../infrastructure/intelligence/sqlite-reports";
import { SqliteScheduleStore } from "../infrastructure/intelligence/sqlite-schedules";
import type { AiKeyParts } from "./ai";
import type { Core } from "./core";

export interface IntelligenceOptions {
  allowHttpFeeds: boolean;
  webResearch?: WebResearchFactory;
  fetcher?: FeedFetcher;
  scheduleGuards?: ScheduleGuards;
}

/** What the area needs, narrower than Core, so route tests can assemble it with fakes. */
export interface IntelligenceWiring extends IntelligenceOptions {
  db: Db;
  jobs: JobRepository;
  clock: Clock;
  credentials: KeySource & ProviderSource;
  posts: PostSource;
  recorder: InteractionRecorder;
  resolveAccount: ResolveAccount;
}

export function buildIntelligence(core: Core, ai: AiKeyParts, options: IntelligenceOptions) {
  const { db, jobs, clock, queries: posts, resolveAccount } = core;
  const { credentials, aiStore: recorder } = ai;
  return assembleIntelligence({
    db,
    jobs,
    clock,
    posts,
    credentials,
    recorder,
    resolveAccount,
    ...options,
  });
}

function buildResearch(w: IntelligenceWiring, peers: PeerStore) {
  return new ResearchService({
    keys: w.credentials,
    providers: w.credentials,
    webResearch: w.webResearch ?? createWebResearch,
    reports: new SqliteReportStore(w.db),
    peers,
    posts: w.posts,
    recorder: w.recorder,
    jobs: w.jobs,
    clock: w.clock,
  });
}

function buildFeeds(w: IntelligenceWiring, feedStore: SqliteFeedStore) {
  const feeds = new FeedService({
    feeds: feedStore,
    fetcher: w.fetcher ?? new HttpFeedFetcher({ allowHttp: w.allowHttpFeeds }),
    jobs: w.jobs,
    clock: w.clock,
    allowHttp: w.allowHttpFeeds,
  });
  const trends = new TrendService({
    feeds: feedStore,
    posts: w.posts,
    digests: new SqliteDigestStore(w.db),
    providers: w.credentials,
    recorder: w.recorder,
    jobs: w.jobs,
    clock: w.clock,
  });
  return { feeds, trends };
}

export function assembleIntelligence(w: IntelligenceWiring) {
  const peerStore = new SqliteRecordTable<Peer>(
    w.db,
    "peers",
    ["name", "profileUrl", "notes"],
    "name COLLATE NOCASE",
  );
  const feedStore = new SqliteFeedStore(w.db);
  const scheduleStore = new SqliteScheduleStore(w.db);
  const research = buildResearch(w, peerStore);
  const { feeds, trends } = buildFeeds(w, feedStore);
  const handlers: Record<string, JobHandler> = {
    [RESEARCH_JOB]: (job) => research.run(job),
    [FEED_REFRESH_JOB]: (job) => feeds.run(job),
    [TREND_DIGEST_JOB]: (job) => trends.runDigest(job),
  };
  return {
    routes: {
      resolveAccount: w.resolveAccount,
      research,
      feeds,
      trends,
      peers: new PeerService(peerStore, w.clock),
      schedules: new ScheduleService(scheduleStore, peerStore, w.clock, w.scheduleGuards),
    },
    handlers,
    scheduler: new Scheduler(scheduleStore, w.jobs),
  };
}
