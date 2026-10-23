import type { AnalyticsService } from "../analytics/analytics-service";
import { type Clock, nowIso } from "../clock";
import type { ContentStore } from "../content/ports";
import { NotFoundError, ValidationError } from "../errors";
import { todayUtc } from "../../domain/dates";
import { type ExperimentEvaluation, evaluateExperiment } from "../../domain/experiments";
import { type GoalProgress, goalProgress } from "../../domain/goals";
import type { Experiment, Goal, NewRecord, PlanItem, RecordStore } from "./ports";

export interface PlanningStores {
  goals: RecordStore<Goal>;
  experiments: RecordStore<Experiment>;
  plan: RecordStore<PlanItem>;
}

type Kind = keyof PlanningStores;
type Entity<K extends Kind> = PlanningStores[K] extends RecordStore<infer T> ? T : never;

const LABELS: Record<Kind, string> = {
  goals: "Goal",
  experiments: "Experiment",
  plan: "Plan item",
};

export class PlanningService {
  constructor(
    private readonly stores: PlanningStores,
    private readonly content: ContentStore,
    private readonly analytics: AnalyticsService,
    private readonly clock: Clock,
  ) {}

  async goals(userId: string): Promise<(Goal & { progress: GoalProgress })[]> {
    const goals = await this.list(userId, "goals");
    const { inputs, asOf } = await this.analytics.measurements(userId);
    const day = asOf ?? todayUtc(this.clock());
    return goals.map((goal) => ({ ...goal, progress: goalProgress(goal, inputs, day) }));
  }

  async experiments(
    userId: string,
  ): Promise<(Experiment & { evaluation: ExperimentEvaluation })[]> {
    const experiments = await this.list(userId, "experiments");
    const { posts, asOf } = await this.analytics.measurements(userId);
    const day = asOf ?? todayUtc(this.clock());
    return experiments.map((e) => ({ ...e, evaluation: evaluateExperiment(e, posts, day) }));
  }

  async planItems(userId: string): Promise<PlanItem[]> {
    return this.list(userId, "plan");
  }

  async create<K extends Kind>(
    userId: string,
    kind: K,
    values: NewRecord<Entity<K>>,
  ): Promise<Entity<K>> {
    assertDates(values);
    const account = await this.content.ensureAccount(userId, nowIso(this.clock));
    await this.assertReferences(account.id, values);
    const store = this.stores[kind] as unknown as RecordStore<Entity<K>>;
    return store.create(account.id, values, nowIso(this.clock));
  }

  async update<K extends Kind>(
    userId: string,
    kind: K,
    id: string,
    patch: Partial<NewRecord<Entity<K>>>,
  ) {
    const accountId = await this.accountId(userId);
    const store = this.stores[kind] as unknown as RecordStore<Entity<K>>;
    const existing = accountId ? await store.get(accountId, id) : null;
    if (!accountId || !existing) throw new NotFoundError(LABELS[kind]);
    assertDates({ ...existing, ...patch });
    await this.assertReferences(accountId, patch);
    return store.update(accountId, id, patch, nowIso(this.clock));
  }

  async remove(userId: string, kind: Kind, id: string): Promise<void> {
    const accountId = await this.accountId(userId);
    const deleted = accountId ? await this.stores[kind].delete(accountId, id) : false;
    if (!deleted) throw new NotFoundError(LABELS[kind]);
  }

  private async list<K extends Kind>(userId: string, kind: K): Promise<Entity<K>[]> {
    const accountId = await this.accountId(userId);
    const store = this.stores[kind] as unknown as RecordStore<Entity<K>>;
    return accountId ? store.list(accountId) : [];
  }

  private async accountId(userId: string): Promise<string | null> {
    return (await this.content.findAccount(userId))?.id ?? null;
  }

  /** Links to goals and posts must stay inside the user's own account. */
  private async assertReferences(accountId: string, values: object): Promise<void> {
    const { goalId, postId } = values as { goalId?: string | null; postId?: string | null };
    if (goalId && !(await this.stores.goals.get(accountId, goalId)))
      throw new NotFoundError("Goal");
    if (postId && !(await this.content.hasPost(accountId, postId))) throw new NotFoundError("Post");
  }
}

function assertDates(values: object): void {
  const { startDate, endDate } = values as { startDate?: string; endDate?: string };
  if (startDate && endDate && endDate < startDate) {
    throw new ValidationError("The end date must not be before the start date");
  }
}
