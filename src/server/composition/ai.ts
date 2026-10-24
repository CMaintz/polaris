import { join } from "node:path";
import { AiService } from "../application/ai/ai-service";
import { CredentialService } from "../application/ai/credentials";
import type { AiProviderFactory } from "../application/ai/ports";
import type { RelatedPosts } from "../application/ai/related-posts";
import type { EvidenceFacts } from "../application/analytics/evidence-facts";
import type { Config } from "../config";
import { AesGcmSecretBox, resolveMasterKey } from "../infrastructure/crypto/secret-box";
import { SqliteAiStore } from "../infrastructure/db/ai-store";
import type { Core } from "./core";

export function buildAiKeys(core: Core, config: Config, factory: AiProviderFactory) {
  const aiStore = new SqliteAiStore(core.db);
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
    insights: aiStore,
    interactions: aiStore,
    jobs,
    audit,
    clock,
  });
}
