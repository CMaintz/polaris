import { type Clock, nowIso } from "../clock";
import { NotFoundError, ValidationError } from "../errors";
import type { NewRecord, RecordStore } from "../planning/ports";
import { normaliseTopic } from "../../domain/pillars";
import type { AccountResolver, Pillar } from "./ports";

export interface PillarDeps {
  pillars: RecordStore<Pillar>;
  accounts: AccountResolver;
  clock: Clock;
}

// Float sums of shares such as 0.1 + 0.2 land a hair above their decimal total.
const SHARE_EPSILON = 1e-9;

export class PillarService {
  constructor(private readonly deps: PillarDeps) {}

  async list(userId: string): Promise<Pillar[]> {
    const accountId = await this.deps.accounts.find(userId);
    return accountId ? this.deps.pillars.list(accountId) : [];
  }

  async create(userId: string, values: NewRecord<Pillar>): Promise<Pillar> {
    const accountId = await this.deps.accounts.ensure(userId);
    await this.assertShares(accountId, null, values.targetShare);
    const clean = { ...values, topics: normaliseTopics(values.topics) };
    return this.deps.pillars.create(accountId, clean, nowIso(this.deps.clock));
  }

  async update(userId: string, id: string, patch: Partial<NewRecord<Pillar>>): Promise<Pillar> {
    const accountId = await this.deps.accounts.find(userId);
    const existing = accountId ? await this.deps.pillars.get(accountId, id) : null;
    if (!accountId || !existing) throw new NotFoundError("Pillar");
    await this.assertShares(accountId, id, patch.targetShare ?? existing.targetShare);
    const clean = patch.topics ? { ...patch, topics: normaliseTopics(patch.topics) } : patch;
    const now = nowIso(this.deps.clock);
    return (await this.deps.pillars.update(accountId, id, clean, now)) as Pillar;
  }

  async remove(userId: string, id: string): Promise<void> {
    const accountId = await this.deps.accounts.find(userId);
    const deleted = accountId ? await this.deps.pillars.delete(accountId, id) : false;
    if (!deleted) throw new NotFoundError("Pillar");
  }

  /** Planned shares describe one posting mix, so together they cannot exceed 100%. */
  private async assertShares(accountId: string, replacing: string | null, share: number) {
    const others = (await this.deps.pillars.list(accountId)).filter((p) => p.id !== replacing);
    const total = others.reduce((sum, p) => sum + p.targetShare, share);
    if (total > 1 + SHARE_EPSILON) {
      throw new ValidationError("Target shares of all pillars together must not exceed 100%");
    }
  }
}

function normaliseTopics(topics: readonly string[]): string[] {
  return [...new Set(topics.map(normaliseTopic).filter((t) => t.length > 0))];
}
