import type { Clock } from "../clock";
import type { AccountScope, ContentStore } from "../content/ports";
import { NotFoundError } from "../errors";
import { todayUtc } from "../../domain/dates";
import {
  type PostRecord,
  type SegmentPerformance,
  postingTimes,
  segmentPerformance,
} from "../../domain/posts";
import type { KpiDto } from "../../../shared/analytics-types";
import { accountKpis } from "./account-series";
import { holdsDataset, loadScopedData } from "./account-data";
import type { ContentQueries } from "./ports";
import { baselineFor, comparablePosts, rankedRecentPosts } from "./post-selection";

/**
 * The account as AI prompts see it: domain records, not HTTP DTOs, so a prompt gets the
 * stored post text rather than the UI's shortened excerpt.
 */
export interface AccountFacts {
  basedOnDemo: boolean;
  kpis: KpiDto[];
  topPosts: PostRecord[];
  bottomPosts: PostRecord[];
  contentTypes: SegmentPerformance[];
  topics: SegmentPerformance[];
  weekdays: SegmentPerformance[];
}

export interface PostFacts {
  basedOnDemo: boolean;
  post: PostRecord;
  /** Every other post of the account. */
  baseline: SegmentPerformance;
  comparable: PostRecord[];
}

export interface EvidenceFacts {
  account(scope: AccountScope, periodDays: number, tzOffsetMinutes: number): Promise<AccountFacts>;
  /** Throws NotFoundError when the post is not the user's. */
  post(scope: AccountScope, postId: string): Promise<PostFacts>;
}

export class AnalyticsEvidenceFacts implements EvidenceFacts {
  constructor(
    private readonly content: ContentStore,
    private readonly queries: ContentQueries,
    private readonly clock: Clock,
  ) {}

  async account(scope: AccountScope, periodDays: number, tzOffsetMinutes: number) {
    const data = await loadScopedData(this.content, this.queries, scope);
    const asOf = data.asOf ?? todayUtc(this.clock());
    const ranked = rankedRecentPosts(data.posts, asOf);
    return {
      basedOnDemo: await holdsDataset(this.content, data, "demo"),
      kpis: accountKpis(data, asOf, periodDays),
      topPosts: ranked.top,
      bottomPosts: ranked.bottom,
      contentTypes: segmentPerformance(data.posts, (p) => [p.contentType]),
      topics: segmentPerformance(data.posts, (p) => p.topics),
      weekdays: postingTimes(data.posts, tzOffsetMinutes).weekdays,
    };
  }

  async post(scope: AccountScope, postId: string) {
    const data = await loadScopedData(this.content, this.queries, scope);
    const post = data.posts.find((p) => p.id === postId);
    if (!post) throw new NotFoundError("Post");
    return {
      basedOnDemo: await holdsDataset(this.content, data, "demo"),
      post,
      baseline: baselineFor(post, data.posts),
      comparable: comparablePosts(post, data.posts),
    };
  }
}
