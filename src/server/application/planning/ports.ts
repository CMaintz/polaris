import type { GoalMetric } from "../../domain/goals";
import type { PostMetricKey } from "../../domain/metrics";

export interface Goal {
  id: string;
  name: string;
  metric: GoalMetric;
  target: number;
  startDate: string;
  endDate: string;
  status: "active" | "archived";
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Experiment {
  id: string;
  goalId: string | null;
  name: string;
  hypothesis: string;
  variable: string;
  metric: PostMetricKey;
  baseline: number | null;
  startDate: string;
  endDate: string;
  status: "planned" | "running" | "completed" | "abandoned";
  result: string;
  conclusion: string;
  followUp: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlanItem {
  id: string;
  title: string;
  concept: string;
  targetTopic: string;
  plannedDate: string | null;
  status: "idea" | "drafting" | "planned" | "published" | "dropped";
  draft: string;
  postId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NewRecord<T> = Omit<T, "id" | "createdAt" | "updatedAt">;

/** CRUD for one kind of user-authored record, always scoped to one account. */
export interface RecordStore<T extends { id: string }> {
  list(accountId: string): Promise<T[]>;
  get(accountId: string, id: string): Promise<T | null>;
  create(accountId: string, values: NewRecord<T>, now: string): Promise<T>;
  update(
    accountId: string,
    id: string,
    patch: Partial<NewRecord<T>>,
    now: string,
  ): Promise<T | null>;
  delete(accountId: string, id: string): Promise<boolean>;
}
