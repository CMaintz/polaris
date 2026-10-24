import type { AccountDirectory } from "../accounts/ports";
import type { PlanItem, RecordStore } from "./ports";

export interface LabelledPlanItem extends PlanItem {
  account: { id: string; label: string; platform: string };
}

// Undated items go last; equal dates keep the order they were planned in.
function byPlannedDate(a: PlanItem, b: PlanItem): number {
  if (a.plannedDate !== b.plannedDate) {
    if (a.plannedDate === null) return 1;
    if (b.plannedDate === null) return -1;
    return a.plannedDate < b.plannedDate ? -1 : 1;
  }
  return a.createdAt.localeCompare(b.createdAt);
}

/** A read-only plan across every account; editing stays per account (ADR 0026). */
export class UnifiedPlan {
  constructor(
    private readonly accounts: Pick<AccountDirectory, "list">,
    private readonly plan: Pick<RecordStore<PlanItem>, "list">,
  ) {}

  async items(userId: string): Promise<LabelledPlanItem[]> {
    const accounts = await this.accounts.list(userId);
    const perAccount = await Promise.all(
      accounts.map(async ({ id, label, platform }) =>
        (await this.plan.list(id)).map((item) => ({ ...item, account: { id, label, platform } })),
      ),
    );
    return perAccount.flat().sort(byPlannedDate);
  }
}
