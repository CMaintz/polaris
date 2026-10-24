import { z } from "zod";
import type { ProposalKind } from "../../domain/proposals";
import type { PlanningWriter, ProposalApplier } from "./ports";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

const planItemPayload = z.object({
  title: z.string().min(1).max(200),
  concept: z.string().max(5000),
  targetTopic: z
    .string()
    .max(100)
    .transform((t) => t.replace(/^#/, "")),
  plannedDate: day,
});

const experimentPayload = z.object({
  name: z.string().min(1).max(200),
  hypothesis: z.string().min(1).max(2000),
  variable: z.string().max(500),
  metric: z.enum([
    "impressions",
    "engagements",
    "engagement_rate",
    "reactions",
    "comments",
    "reposts",
  ]),
  startDate: day,
  endDate: day,
});

const goalPayload = z.object({
  name: z.string().min(1).max(200),
  metric: z.enum(["followers", "impressions", "engagements", "posts", "engagement_rate"]),
  target: z.number().positive(),
  startDate: day,
  endDate: day,
});

export const PAYLOAD_SCHEMAS: Record<ProposalKind, z.ZodType> = {
  plan_item: planItemPayload,
  experiment: experimentPayload,
  goal: goalPayload,
};

export type PlanItemPayload = z.infer<typeof planItemPayload>;
export type ExperimentPayload = z.infer<typeof experimentPayload>;

export function planningAppliers(planning: PlanningWriter): ProposalApplier[] {
  const planItem: ProposalApplier<PlanItemPayload> = {
    kind: "plan_item",
    apply: (userId, p) =>
      planning.create(userId, "plan", { ...p, status: "planned", draft: "", postId: null }),
  };
  const experiment: ProposalApplier<ExperimentPayload> = {
    kind: "experiment",
    apply: (userId, p) =>
      planning.create(userId, "experiments", {
        ...p,
        goalId: null,
        baseline: null,
        status: "planned",
        result: "",
        conclusion: "",
        followUp: "",
      }),
  };
  const goal: ProposalApplier<z.infer<typeof goalPayload>> = {
    kind: "goal",
    apply: (userId, p) => planning.create(userId, "goals", { ...p, status: "active", notes: "" }),
  };
  return [planItem, experiment, goal] as ProposalApplier[];
}
