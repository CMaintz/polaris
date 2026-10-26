import { join } from "node:path";
import { AiService } from "../application/ai/ai-service";
import { CredentialService } from "../application/ai/credentials";
import type { AiProviderFactory } from "../application/ai/ports";
import type { RelatedPosts } from "../application/ai/related-posts";
import type { EvidenceFacts } from "../application/analytics/evidence-facts";
import type { Config } from "../config";
import { AesGcmSecretBox, resolveMasterKey } from "../infrastructure/crypto/secret-box";
import { SqliteInsightStore } from "../infrastructure/db/insight-store";
import { MeteredAiStore } from "../infrastructure/telemetry/metered-ai-store";
import type { Core } from "./core";

export function buildAiKeys(core: Core, config: Config, factory: AiProviderFactory) {
  const aiStore = new MeteredAiStore(core.db, core.telemetry);
  const box = new AesGcmSecretBox(
    resolveMasterKey(config.masterKey, join(config.dataDir, "master.key")),
  );
  const credentials = new CredentialService(aiStore, box, factory, core.audit, core.clock);
  return { aiStore, box, credentials };
}

export type AiKeyParts = ReturnType<typeof buildAiKeys>;

export function buildAiService(
  core: Core,
  { aiStore, credentials }: AiKeyParts,
  analysis: { facts: EvidenceFacts; related: RelatedPosts },
) {
  const { content, resolveAccount, jobs, audit, clock } = core;
  return new AiService({
    credentials,
    ...analysis,
    content,
    resolveAccount,
    insights: new SqliteInsightStore(core.db),
    interactions: aiStore,
    jobs,
    audit,
    clock,
  });
}
