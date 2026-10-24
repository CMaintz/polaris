import { type ReactNode, createContext, useContext } from "react";
import type { ImportStatusDto, UserDto } from "../../shared/api-types";

export interface Session {
  user: UserDto;
  status: ImportStatusDto | null;
  refreshStatus: () => void;
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
