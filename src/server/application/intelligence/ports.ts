import type { AiProvider, AiProviderId } from "../ai/ports";
import type { RecordStore } from "../planning/ports";
import type {
  Cadence,
  ResearchReportBody,
  ScheduleKind,
  ScheduleParams,
  TrendMatchDto,
  DigestAiDto,
} from "../../../shared/intelligence-types";

export type ResolveAccount = (userId: string) => Promise<string | null>;

export interface ActiveKey {
  provider: AiProviderId;
  apiKey: string;
  model: string;
}

export interface KeySource {
  activeKey(userId: string): Promise<ActiveKey | null>;
}

export interface ProviderSource {
  activeProvider(userId: string): Promise<AiProvider | null>;
}

export type { InteractionRecorder } from "../ai/recorded-call";

export interface WebSource {
  url: string;
  title: string;
}

export interface WebResearchRequest {
  system: string;
  prompt: string;
  maxTokens: number;
}

export interface WebResearchResult {
  /** The model's notes, written from what it found. Untrusted: it quotes web pages. */
  text: string;
  sources: WebSource[];
  model: string;
  usage: { inputTokens: number | null; outputTokens: number | null };
}

export interface WebResearchProvider {
  readonly id: AiProviderId;
  readonly model: string;
  research(request: WebResearchRequest): Promise<WebResearchResult>;
}

export type WebResearchFactory = (key: ActiveKey) => WebResearchProvider;

export interface Peer {
  id: string;
  name: string;
  profileUrl: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type PeerStore = RecordStore<Peer>;

export interface PendingReport {
  id: string;
  accountId: string;
  question: string;
  peerId: string | null;
  peerName: string | null;
  createdAt: string;
}

export interface StoredReport extends PendingReport {
  jobStatus: string | null;
  jobError: string | null;
  completedAt: string | null;
  body: ResearchReportBody | null;
}

export interface ReportStore {
  /** Inserts the report once; a second call with the same id changes nothing. */
  ensure(report: PendingReport): Promise<void>;
  complete(id: string, body: ResearchReportBody, now: string): Promise<void>;
  get(accountId: string, id: string): Promise<StoredReport | null>;
  list(accountId: string, limit: number): Promise<StoredReport[]>;
}

export interface ParsedFeedItem {
  guid: string | null;
  link: string | null;
  title: string;
  summary: string;
  publishedAt: string | null;
}

export interface ParsedFeed {
  title: string | null;
  items: ParsedFeedItem[];
}

/** Fetches and parses a feed. Throws an error whose message is safe to show. */
export interface FeedFetcher {
  fetch(url: string): Promise<ParsedFeed>;
}

export interface Feed {
  id: string;
  url: string;
  title: string | null;
  lastFetchedAt: string | null;
  lastStatus: "ok" | "error" | null;
  lastError: string | null;
  itemCount: number;
  createdAt: string;
}

export interface StoredFeedItem {
  id: string;
  feedId: string;
  feedTitle: string | null;
  title: string;
  summary: string;
  link: string | null;
  publishedAt: string | null;
  fetchedAt: string;
}

export interface FeedStore {
  list(accountId: string): Promise<Feed[]>;
  get(accountId: string, id: string): Promise<Feed | null>;
  /** Null when the account already has a feed with this URL. */
  create(accountId: string, url: string, now: string): Promise<Feed | null>;
  delete(accountId: string, id: string): Promise<boolean>;
  addItems(
    feedId: string,
    items: (ParsedFeedItem & { key: string })[],
    now: string,
  ): Promise<number>;
  recordFetch(
    feedId: string,
    result: { title: string | null; error: string | null },
    now: string,
  ): Promise<void>;
  items(accountId: string, since: string): Promise<StoredFeedItem[]>;
  firstFetch(accountId: string): Promise<string | null>;
  pruneBefore(accountId: string, before: string): Promise<void>;
}

export interface StoredDigest {
  id: string;
  from: string;
  to: string;
  matches: TrendMatchDto[];
  ai: DigestAiDto;
  createdAt: string;
}

export interface DigestStore {
  /** Saves under the job id, replacing an earlier attempt of the same job. */
  save(accountId: string, digest: StoredDigest): Promise<void>;
  list(accountId: string, limit: number): Promise<StoredDigest[]>;
}

export interface Schedule {
  id: string;
  kind: ScheduleKind;
  cadence: Cadence;
  params: ScheduleParams;
  enabled: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  lastJobId: string | null;
  createdAt: string;
}

export interface DueSchedule extends Schedule {
  accountId: string;
  userId: string;
}

export interface ScheduleStore {
  list(accountId: string): Promise<Schedule[]>;
  get(accountId: string, id: string): Promise<Schedule | null>;
  create(
    accountId: string,
    values: Pick<Schedule, "kind" | "cadence" | "params" | "nextRunAt">,
    now: string,
  ): Promise<Schedule>;
  update(
    accountId: string,
    id: string,
    patch: Partial<Pick<Schedule, "cadence" | "enabled">>,
    now: string,
  ): Promise<Schedule | null>;
  delete(accountId: string, id: string): Promise<boolean>;
  due(now: string): Promise<DueSchedule[]>;
  /**
   * Moves a schedule from `expectedNextRunAt` to `nextRunAt`. False when another tick got
   * there first, which is what keeps two ticks from enqueueing the same run.
   */
  claim(id: string, expectedNextRunAt: string, nextRunAt: string, now: string): Promise<boolean>;
  setLastJob(id: string, jobId: string): Promise<void>;
}
