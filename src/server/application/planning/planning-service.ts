import { type Clock, nowIso } from "../clock";
import type { ContentStore, ResolveAccount } from "../content/ports";
import { NotFoundError, ValidationError } from "../errors";
import { todayUtc } from "../../domain/dates";
import { type ExperimentEvaluation, evaluateExperiment } from "../../domain/experiments";
import { type GoalProgress, goalProgress } from "../../domain/goals";
import type {
  Experiment,
  Goal,
  Measurements,
  NewRecord,
  PlanItem,
  PlanningEntities,
  PlanningKind as Kind,
  PlanningStores,
} from "./ports";

type Values<K extends Kind> = Partial<NewRecord<PlanningEntities[K]>>;

/** What a record points at and the window it covers, read per kind so a rename fails to compile. */
interface Shape {
  goalId?: string | null;
  postId?: string | null;
  startDate?: string;
  endDate?: string;
}

const SHAPES: { [K in Kind]: (values: Values<K>) => Shape } = {
  goals: (v) => ({ startDate: v.startDate, endDate: v.endDate }),
  experiments: (v) => ({ goalId: v.goalId, startDate: v.startDate, endDate: v.endDate }),
  plan: (v) => ({ postId: v.postId }),
};

const LABELS: Record<Kind, string> = {
  goals: "Goal",
  experiments: "Experiment",
  plan: "Plan item",
};

export interface PlanningDeps {
  stores: PlanningStores;
  content: Pick<ContentStore, "ensureAccount" | "hasPost">;
  resolveAccount: ResolveAccount;
  measurements: Measurements;
  clock: Clock;
}

export class PlanningService {
  constructor(private readonly deps: PlanningDeps) {}

  async goals(userId: string): Promise<(Goal & { progress: GoalProgress })[]> {
    const goals = await this.list(userId, "goals");
    const { inputs, asOf } = await this.deps.measurements.measurements(userId);
    const day = asOf ?? todayUtc(this.deps.clock());
    return goals.map((goal) => ({ ...goal, progress: goalProgress(goal, inputs, day) }));
  }

  async experiments(
    userId: string,
  ): Promise<(Experiment & { evaluation: ExperimentEvaluation })[]> {
    const experiments = await this.list(userId, "experiments");
    const { posts, asOf } = await this.deps.measurements.measurements(userId);
    const day = asOf ?? todayUtc(this.deps.clock());
    return experiments.map((e) => ({ ...e, evaluation: evaluateExperiment(e, posts, day) }));
  }

  async planItems(userId: string): Promise<PlanItem[]> {
    return this.list(userId, "plan");
  }

  async create<K extends Kind>(
    userId: string,
    kind: K,
    values: NewRecord<PlanningEntities[K]>,
  ): Promise<PlanningEntities[K]> {
    const shape = SHAPES[kind](values);
    assertDates(shape);
    const now = nowIso(this.deps.clock);
    const account = await this.deps.content.ensureAccount(userId, now);
    await this.assertReferences(account.id, shape);
    return this.deps.stores[kind].create(account.id, values, now);
  }

  async update<K extends Kind>(userId: string, kind: K, id: string, patch: Values<K>) {
    const accountId = await this.deps.resolveAccount(userId);
    const store = this.deps.stores[kind];
    const existing = accountId ? await store.get(accountId, id) : null;
    if (!accountId || !existing) throw new NotFoundError(LABELS[kind]);
    assertDates(SHAPES[kind]({ ...existing, ...patch }));
    await this.assertReferences(accountId, SHAPES[kind](patch));
    return store.update(accountId, id, patch, nowIso(this.deps.clock));
  }

  async remove(userId: string, kind: Kind, id: string): Promise<void> {
    const accountId = await this.deps.resolveAccount(userId);
    const deleted = accountId ? await this.deps.stores[kind].delete(accountId, id) : false;
    if (!deleted) throw new NotFoundError(LABELS[kind]);
  }

  private async list<K extends Kind>(userId: string, kind: K): Promise<PlanningEntities[K][]> {
    const accountId = await this.deps.resolveAccount(userId);
    return accountId ? this.deps.stores[kind].list(accountId) : [];
  }

  /** Links to goals and posts must stay inside the user's own account. */
  private async assertReferences(accountId: string, { goalId, postId }: Shape): Promise<void> {
    if (goalId && !(await this.deps.stores.goals.get(accountId, goalId)))
      throw new NotFoundError("Goal");
    if (postId && !(await this.deps.content.hasPost(accountId, postId)))
      throw new NotFoundError("Post");
  }
}

function assertDates({ startDate, endDate }: Shape): void {
  if (startDate && endDate && endDate < startDate) {
    throw new ValidationError("The end date must not be before the start date");
  }
}
