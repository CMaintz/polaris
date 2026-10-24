import { useCallback, useEffect, useState } from "react";
import type { AccountListDto, PlatformDto } from "../../shared/account-types";
import type { ImportStatusDto } from "../../shared/api-types";
import { useResource } from "./hooks";

export const PLATFORM_NAMES: Record<PlatformDto, string> = { linkedin: "LinkedIn", other: "Other" };

/**
 * The user's accounts. `generation` changes only when the user switches, adds or deletes an
 * account, so pages keyed on it reload then, but not when an import creates the first one.
 */
export function useAccounts(status: ImportStatusDto | null, refreshStatus: () => void) {
  const list = useResource<AccountListDto>("/accounts");
  const [generation, setGeneration] = useState(0);
  const { reload } = list;
  const accounts = list.data?.accounts ?? null;
  const activeId = status?.account?.id;
  const known = accounts?.some((a) => a.id === activeId) ?? true;
  useEffect(() => {
    if (activeId && !known) reload();
  }, [activeId, known, reload]);
  const accountsChanged = useCallback(() => {
    reload();
    refreshStatus();
    setGeneration((g) => g + 1);
  }, [reload, refreshStatus]);
  return { accounts, accountsChanged, generation };
}
