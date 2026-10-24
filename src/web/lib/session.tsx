import { type ReactNode, createContext, useContext } from "react";
import type { AccountSummaryDto } from "../../shared/account-types";
import type { UserDto } from "../../shared/core-types";
import type { ImportStatusDto } from "../../shared/import-types";

export interface Session {
  user: UserDto;
  status: ImportStatusDto | null;
  refreshStatus: () => void;
  accounts: AccountSummaryDto[] | null;
  /** Call after switching, adding or deleting an account: every page reloads its data. */
  accountsChanged: () => void;
  generation: number;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ session, children }: { session: Session; children: ReactNode }) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession outside the signed-in app");
  return session;
}
