import { addDays, isWithin } from "./dates";

export type ProposalKind = "plan_item" | "experiment" | "goal";
export type ProposalStatus = "pending" | "approved" | "rejected" | "applied" | "failed";
export type ProposalOrigin = "ai" | "user";

/** The days a plan for the next `weeks` weeks may use: tomorrow through the last day. */
export function planningWindow(today: string, weeks: number): { from: string; to: string } {
  return { from: addDays(today, 1), to: addDays(today, weeks * 7) };
}

export function inWindow(day: string, window: { from: string; to: string }): boolean {
  return isWithin(day, window.from, window.to);
}
