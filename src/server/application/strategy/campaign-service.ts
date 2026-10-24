import { type Clock, nowIso } from "../clock";
import { NotFoundError, ValidationError } from "../errors";
import type { NewRecord, RecordStore } from "../planning/ports";
import { campaignPostIds } from "../../domain/campaigns";
import type { CampaignDto } from "../../../shared/strategy-types";
import type {
  AccountResolver,
  Campaign,
  CampaignLinkStore,
  CampaignLinks,
  LinkTargets,
} from "./ports";

export interface CampaignDeps {
  campaigns: RecordStore<Campaign>;
  links: CampaignLinkStore;
  targets: LinkTargets;
  accounts: AccountResolver;
  clock: Clock;
}

export interface CampaignWithPosts {
  accountId: string;
  campaign: Campaign;
  postIds: Set<string>;
}

type LinkKind = keyof CampaignLinks;

type OwnedCheck = (targets: LinkTargets, accountId: string, id: string) => Promise<boolean>;

const LINK_CHECKS: Record<LinkKind, { label: string; owned: OwnedCheck }> = {
  postIds: { label: "Post", owned: (t, a, id) => t.hasPost(a, id) },
  planItemIds: { label: "Plan item", owned: (t, a, id) => t.hasPlanItem(a, id) },
  goalIds: { label: "Goal", owned: (t, a, id) => t.hasGoal(a, id) },
};

export class CampaignService {
  constructor(private readonly deps: CampaignDeps) {}

  async list(userId: string): Promise<CampaignDto[]> {
    const accountId = await this.deps.accounts.find(userId);
    if (!accountId) return [];
    const campaigns = await this.deps.campaigns.list(accountId);
    return Promise.all(campaigns.map((c) => this.withLinks(c)));
  }

  async get(userId: string, id: string): Promise<CampaignDto> {
    return this.withLinks((await this.owned(userId, id)).campaign);
  }

  async create(userId: string, values: NewRecord<Campaign>): Promise<CampaignDto> {
    assertDates(values);
    const accountId = await this.deps.accounts.ensure(userId);
    const created = await this.deps.campaigns.create(accountId, values, nowIso(this.deps.clock));
    return this.withLinks(created);
  }

  async update(userId: string, id: string, patch: Partial<NewRecord<Campaign>>) {
    const { accountId, campaign } = await this.owned(userId, id);
    assertDates({ ...campaign, ...patch });
    const now = nowIso(this.deps.clock);
    const updated = await this.deps.campaigns.update(accountId, id, patch, now);
    return this.withLinks(updated as Campaign);
  }

  async remove(userId: string, id: string): Promise<void> {
    const { accountId } = await this.owned(userId, id);
    await this.deps.campaigns.delete(accountId, id);
  }

  /** Replaces every link of the campaign; each target must belong to the same account. */
  async setLinks(userId: string, id: string, links: CampaignLinks): Promise<CampaignDto> {
    const { accountId, campaign } = await this.owned(userId, id);
    const unique = dedupe(links);
    for (const kind of Object.keys(LINK_CHECKS) as LinkKind[]) {
      await this.assertOwned(accountId, kind, unique[kind]);
    }
    await this.deps.links.replace(id, unique);
    return this.withLinks(campaign);
  }

  async withPosts(userId: string, id: string): Promise<CampaignWithPosts> {
    const { accountId, campaign } = await this.owned(userId, id);
    const links = await this.deps.links.links(id);
    const viaPlan = await this.deps.targets.planItemPostIds(accountId, links.planItemIds);
    const postIds = campaignPostIds(
      links.postIds,
      viaPlan.map((postId) => ({ postId })),
    );
    return { accountId, campaign, postIds };
  }

  private async assertOwned(accountId: string, kind: LinkKind, ids: string[]) {
    const { label, owned } = LINK_CHECKS[kind];
    for (const id of ids) {
      if (!(await owned(this.deps.targets, accountId, id))) throw new NotFoundError(label);
    }
  }

  private async owned(userId: string, id: string) {
    const accountId = await this.deps.accounts.find(userId);
    const campaign = accountId ? await this.deps.campaigns.get(accountId, id) : null;
    if (!accountId || !campaign) throw new NotFoundError("Campaign");
    return { accountId, campaign };
  }

  private async withLinks(campaign: Campaign): Promise<CampaignDto> {
    return { ...campaign, links: await this.deps.links.links(campaign.id) };
  }
}

function dedupe(links: CampaignLinks): CampaignLinks {
  return {
    postIds: [...new Set(links.postIds)],
    planItemIds: [...new Set(links.planItemIds)],
    goalIds: [...new Set(links.goalIds)],
  };
}

function assertDates({ startDate, endDate }: { startDate?: string; endDate?: string }) {
  if (startDate && endDate && endDate < startDate) {
    throw new ValidationError("The end date must not be before the start date");
  }
}
