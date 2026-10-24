import { nowIso } from "../application/clock";
import { CampaignService } from "../application/strategy/campaign-service";
import { PillarService } from "../application/strategy/pillar-service";
import { StrategyAnalysis } from "../application/strategy/strategy-analysis";
import {
  SqliteCampaignLinkStore,
  SqliteLinkTargets,
  SqlitePillarStore,
  campaignTable,
} from "../infrastructure/db/strategy-store";
import type { Core } from "./core";

export function buildStrategy(core: Core) {
  const { db, content, queries, resolveAccount, clock } = core;
  const accounts = {
    find: resolveAccount,
    ensure: async (userId: string) => (await content.ensureAccount(userId, nowIso(clock))).id,
  };
  const campaigns = new CampaignService({
    campaigns: campaignTable(db),
    links: new SqliteCampaignLinkStore(db),
    targets: new SqliteLinkTargets(db),
    accounts,
    clock,
  });
  const pillars = new PillarService({ pillars: new SqlitePillarStore(db), accounts, clock });
  const analysis = new StrategyAnalysis({ data: queries, accounts, campaigns, pillars, clock });
  return { campaigns, pillars, analysis };
}
