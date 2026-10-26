import { aiCallLabels } from "../../application/ai/recorded-call";
import type { InteractionRecord } from "../../application/ai/store";
import type { Telemetry } from "../../application/telemetry/ports";
import type { Db } from "../db/database";
import { SqliteAiStore } from "../db/ai-store";

/**
 * Every AI provider call, from any service, is recorded through this store (ADR 0014), so
 * counting here covers them all without threading telemetry through each caller.
 */
export class MeteredAiStore extends SqliteAiStore {
  constructor(
    db: Db,
    private readonly telemetry: Telemetry,
  ) {
    super(db);
  }

  // Counted before the write: the provider call happened even if recording it fails.
  override async recordInteraction(record: InteractionRecord): Promise<string> {
    this.telemetry.count("ai_calls_total", aiCallLabels(record));
    return super.recordInteraction(record);
  }
}
