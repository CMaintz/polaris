import type { CampaignStatus } from "../../domain/campaigns";
import type { PostRecord } from "../../domain/posts";
import type { AccountDay } from "../analytics/ports";

export interface Campaign {
  id: string;
  name: string;
  objective: string;
  startDate: string;
  endDate: string;
  status: CampaignStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Pillar {
  id: string;
  name: string;
  description: string;
  topics: string[];
  targetShare: number;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignLinks {
  postIds: string[];
  planItemIds: string[];
  goalIds: string[];
}

/** Link rows of one campaign. Callers check ownership of the campaign and of every target. */
export interface CampaignLinkStore {
  links(campaignId: string): Promise<CampaignLinks>;
  replace(campaignId: string, links: CampaignLinks): Promise<void>;
}

export interface LinkTargets {
  hasPost(accountId: string, postId: string): Promise<boolean>;
  hasPlanItem(accountId: string, planItemId: string): Promise<boolean>;
  hasGoal(accountId: string, goalId: string): Promise<boolean>;
  /** Ignores plan items of other accounts. */
  planItemPostIds(accountId: string, planItemIds: readonly string[]): Promise<string[]>;
}

export interface StrategyData {
  posts(accountId: string): Promise<PostRecord[]>;
  accountDays(accountId: string): Promise<AccountDay[]>;
}

/** `ensure` creates the account, for writes made before the first import. */
export interface AccountResolver {
  find(userId: string): Promise<string | null>;
  ensure(userId: string): Promise<string>;
}
