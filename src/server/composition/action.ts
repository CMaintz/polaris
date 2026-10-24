import { planningAppliers } from "../application/action/appliers";
import { ConnectionService } from "../application/action/connections";
import { DRAFT_JOB, DraftingService } from "../application/action/drafting";
import { DraftService } from "../application/action/drafts";
import { PLAN_JOB, PlanningAgent } from "../application/action/planning-agent";
import { ProposalService } from "../application/action/proposals";
import { PUBLISH_JOB, PublishingService } from "../application/action/publishing";
import type { EvidenceFacts } from "../application/analytics/evidence-facts";
import type { PlanningService } from "../application/planning/planning-service";
import type { PlanningStores } from "../application/planning/ports";
import { SqliteDraftStore, SqliteProposalStore } from "../infrastructure/db/action-store";
import {
  SqliteConnectionStore,
  SqliteOAuthStateStore,
} from "../infrastructure/publishing/connection-store";
import type { LinkedInAppConfig } from "../infrastructure/publishing/linkedin-oauth";
import { LinkedInApiProvider } from "../infrastructure/publishing/linkedin-provider";
import { ManualPublishingProvider } from "../infrastructure/publishing/manual-provider";
import { SqlitePublicationStore } from "../infrastructure/publishing/publication-store";
import type { AiKeyParts } from "./ai";
import type { Core } from "./core";

export interface ActionInputs {
  planning: PlanningService;
  stores: PlanningStores;
  facts: EvidenceFacts;
  linkedin: LinkedInAppConfig | null;
}

export function buildAction(core: Core, ai: AiKeyParts, inputs: ActionInputs) {
  const { db, jobs, resolveAccount, audit, clock } = core;
  const common = { resolveAccount, audit, clock };
  const planItems = inputs.stores.plan;
  const publications = new SqlitePublicationStore(db);
  const drafts = new DraftService({
    ...common,
    drafts: new SqliteDraftStore(db),
    publications,
    planItems,
  });
  const models = { models: ai.credentials, recorder: ai.aiStore, facts: inputs.facts, jobs, clock };
  const proposals = new ProposalService({
    ...common,
    store: new SqliteProposalStore(db),
    appliers: planningAppliers(inputs.planning),
  });
  const connections = new SqliteConnectionStore(db);
  const linkedin = new LinkedInApiProvider(inputs.linkedin, connections, ai.box, fetch, clock);
  const providers = [linkedin, new ManualPublishingProvider()];
  const states = new SqliteOAuthStateStore(db);
  const publishing = new PublishingService({
    ...common,
    drafts,
    publications,
    providers,
    planItems,
    jobs,
  });
  const services = {
    drafts,
    drafting: new DraftingService({ ...models, drafts }),
    proposals,
    planner: new PlanningAgent({ ...models, ...common, proposals, planItems }),
    publishing,
    connections: new ConnectionService({ ...common, providers, states }),
  };
  const handlers = {
    [DRAFT_JOB]: services.drafting.run.bind(services.drafting),
    [PLAN_JOB]: services.planner.run.bind(services.planner),
    [PUBLISH_JOB]: publishing.run.bind(publishing),
  };
  return { ...services, handlers };
}
