import { todayUtc } from "../../domain/dates";
import type { AccountDirectory } from "../accounts/ports";
import { accountsWithActive, toAccountSummary } from "../accounts/summary";
import type { Clock } from "../clock";
import type { Account } from "../content/ports";
import type { ComparisonDto } from "../../../shared/account-types";
import { type Loaded, accountKpis } from "./account-series";
import { loadAccount } from "./account-data";
import type { ContentQueries } from "./ports";

// One end day for every row: each account's own latest day would compare different weeks.
function commonEnd(loaded: readonly Loaded[]): string | null {
  const days = loaded.flatMap((d) => (d.asOf ? [d.asOf] : []));
  return days.length > 0 ? days.reduce((a, b) => (a > b ? a : b)) : null;
}

/** The headline KPIs of every account side by side, over one shared period (ADR 0026). */
export class ComparisonService {
  constructor(
    private readonly accounts: Pick<AccountDirectory, "list" | "activeId">,
    private readonly queries: ContentQueries,
    private readonly clock: Clock,
  ) {}

  async compare(userId: string, periodDays: number): Promise<ComparisonDto> {
    const { accounts, activeId } = await accountsWithActive(this.accounts, userId);
    const loaded = await Promise.all(accounts.map((a) => loadAccount(this.queries, a)));
    const asOf = commonEnd(loaded) ?? todayUtc(this.clock());
    const rows = loaded.map((data) => ({
      account: toAccountSummary(data.account as Account, activeId),
      latestData: data.asOf,
      kpis: accountKpis(data, asOf, periodDays),
    }));
    return { asOf, periodDays, rows };
  }
}
