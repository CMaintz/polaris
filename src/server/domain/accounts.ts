/** The platform an account's data comes from. "other" covers any platform without an adapter. */
export type Platform = "linkedin" | "other";

export const PLATFORMS: readonly Platform[] = ["linkedin", "other"];

/** The account created for a user who writes or imports before adding one (ADR 0026). */
export const FIRST_ACCOUNT = { platform: "linkedin", label: "LinkedIn" } as const;

export const MAX_LABEL = 60;

/**
 * The account the user is working in: the one they chose, or else their oldest. The fallback
 * covers users who never switched and the moment after the active account is deleted.
 */
export function activeAccount<T extends { id: string }>(
  accounts: readonly T[],
  activeId: string | null,
): T | null {
  return accounts.find((a) => a.id === activeId) ?? accounts[0] ?? null;
}

export const PLATFORM_NAMES: Record<Platform, string> = { linkedin: "LinkedIn", other: "Other" };
