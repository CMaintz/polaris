import { addDays, isWithin } from "./dates";

export type ProposalKind = "plan_item" | "experiment" | "goal";
export type ProposalStatus = "pending" | "approved" | "rejected" | "applied" | "failed";
export type ProposalOrigin = "ai" | "user";

/**
 * A failed apply may be approved again (the cause may have been fixed); a rejected or applied
 * proposal is final, which is what keeps a rejected proposal from ever changing data.
 */
export function isDecidable(status: ProposalStatus): boolean {
  return status === "pending" || status === "failed";
}

/** The days a plan for the next `weeks` weeks may use: tomorrow through the last day. */
export function planningWindow(today: string, weeks: number): { from: string; to: string } {
  return { from: addDays(today, 1), to: addDays(today, weeks * 7) };
}

export function inWindow(day: string, window: { from: string; to: string }): boolean {
  return isWithin(day, window.from, window.to);
}
