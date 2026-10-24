import type { AiProvider } from "../ai/ports";
import type { EvidenceFacts } from "../analytics/evidence-facts";
import type { Experiment, Goal, NewRecord, PlanItem, RecordStore } from "../planning/ports";

export interface PlanningWriter {
  create(userId: string, kind: "plan", values: NewRecord<PlanItem>): Promise<{ id: string }>;
  create(
    userId: string,
    kind: "experiments",
    values: NewRecord<Experiment>,
  ): Promise<{ id: string }>;
  create(userId: string, kind: "goals", values: NewRecord<Goal>): Promise<{ id: string }>;
}

export type PlanItems = Pick<RecordStore<PlanItem>, "get" | "list" | "update">;

export interface ModelSource {
  activeProvider(userId: string): Promise<AiProvider | null>;
}

export type AccountFactsSource = Pick<EvidenceFacts, "account">;
