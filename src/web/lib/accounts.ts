import type { PlatformDto } from "../../shared/account-types";

export const PLATFORM_NAMES: Record<PlatformDto, string> = { linkedin: "LinkedIn", other: "Other" };

export function accountName(account: { label: string; platform: PlatformDto }): string {
  const platform = PLATFORM_NAMES[account.platform];
  return account.label.toLowerCase() === platform.toLowerCase()
    ? account.label
    : `${account.label} (${platform})`;
}
