import type {
  Experiment,
  Goal,
  NewRecord,
  PlanItem,
  PlanningStores,
} from "../../application/planning/ports";
import type { Db } from "./database";
import { SqliteRecordTable } from "./record-table";

/**
 * Every writable field of `T`, as a set. Typed as a record over all of `NewRecord<T>`, so a
 * field added to the type and left out here, or a stray one, fails to compile instead of
 * being silently never stored.
 */
function columns<T extends { id: string }>(
  fields: Record<keyof NewRecord<T>, true>,
): (keyof T & string)[] {
  return Object.keys(fields) as (keyof T & string)[];
}

const GOAL_COLUMNS = columns<Goal>({
  name: true,
  metric: true,
  target: true,
  startDate: true,
  endDate: true,
  status: true,
  notes: true,
});

const EXPERIMENT_COLUMNS = columns<Experiment>({
  goalId: true,
  name: true,
  hypothesis: true,
  variable: true,
  metric: true,
  baseline: true,
  startDate: true,
  endDate: true,
  status: true,
  result: true,
  conclusion: true,
  followUp: true,
});

const PLAN_COLUMNS = columns<PlanItem>({
  title: true,
  concept: true,
  targetTopic: true,
  plannedDate: true,
  status: true,
  draft: true,
  postId: true,
});

export function sqlitePlanningStores(db: Db): PlanningStores {
  return {
    goals: new SqliteRecordTable<Goal>(db, "goals", GOAL_COLUMNS, "end_date, created_at"),
    experiments: new SqliteRecordTable<Experiment>(
      db,
      "experiments",
      EXPERIMENT_COLUMNS,
      "start_date DESC, created_at",
    ),
    plan: new SqliteRecordTable<PlanItem>(
      db,
      "plan_items",
      PLAN_COLUMNS,
      "planned_date IS NULL, planned_date, created_at",
    ),
  };
}
