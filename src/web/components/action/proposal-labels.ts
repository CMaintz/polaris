import type { ProposalDto } from "../../../shared/action-types";

export const PROPOSAL_KIND: Record<ProposalDto["kind"], string> = {
  plan_item: "Plan item",
  experiment: "Experiment",
  goal: "Goal",
};

export const PROPOSAL_STATUS: Record<ProposalDto["status"], string> = {
  pending: "Waiting for you",
  approved: "Approved",
  rejected: "Rejected",
  applied: "Approved and added",
  failed: "Approved, but could not be added",
};

/** The proposed item's title or name, falling back to its kind. */
export function proposalSummary(p: ProposalDto): string {
  const { title, name } = p.payload as { title?: string; name?: string };
  return title ?? name ?? PROPOSAL_KIND[p.kind];
}
