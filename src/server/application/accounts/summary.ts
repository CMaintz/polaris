import { activeAccount } from "../../domain/accounts";
import type { AccountSummaryDto } from "../../../shared/account-types";
import type { Account } from "../content/ports";
import type { AccountDirectory } from "./ports";

export async function accountsWithActive(
  directory: Pick<AccountDirectory, "list" | "activeId">,
  userId: string,
): Promise<{ accounts: Account[]; activeId: string | null }> {
  const [accounts, chosen] = await Promise.all([
    directory.list(userId),
    directory.activeId(userId),
  ]);
  return { accounts, activeId: activeAccount(accounts, chosen)?.id ?? null };
}

export const toAccountSummary = (account: Account, activeId: string | null): AccountSummaryDto => ({
  id: account.id,
  platform: account.platform,
  label: account.label,
  displayName: account.displayName,
  active: account.id === activeId,
});
