import { useCallback, useEffect, useState } from "react";
import type { UserDto } from "../shared/core-types";
import type { ImportStatusDto } from "../shared/import-types";
import { api, isUnauthorized, post } from "./lib/api";
import { ErrorBox } from "./components/common/feedback";
import { AppRoutes } from "./components/shell/app-routes";
import { DemoBanner } from "./components/shell/demo-banner";
import { Sidebar } from "./components/shell/sidebar";
import { useAccounts } from "./lib/hooks/accounts";
import { useResource } from "./lib/hooks/resource";
import { type Session, SessionProvider, useSession } from "./lib/session";
import { LoginPage } from "./pages/Login";

export function App() {
  const [user, setUser] = useState<UserDto | null | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    api<{ user: UserDto }>("/auth/me")
      .then((r) => setUser(r.user))
      // Only a 401 means signed out; an outage must not send a signed-in user to the login page.
      .catch((e: Error) => (isUnauthorized(e) ? setUser(null) : setError(e)));
  }, [attempt]);
  const retry = () => {
    setError(null);
    setAttempt((a) => a + 1);
  };
  if (error) return <SessionError error={error} onRetry={retry} />;
  if (user === undefined) return <div className="auth-shell muted">Loading...</div>;
  if (user === null) return <LoginPage onSignedIn={setUser} />;
  return <SignedIn user={user} onSignedOut={() => setUser(null)} />;
}

function SessionError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="auth-shell stack">
      <ErrorBox error={error} />
      <p className="muted">Polaris could not check your session. This is not a sign-out.</p>
      <div>
        <button className="btn primary" onClick={onRetry}>
          Try again
        </button>
      </div>
    </div>
  );
}

function SignedIn({ user, onSignedOut }: { user: UserDto; onSignedOut: () => void }) {
  const status = useResource<ImportStatusDto>("/imports/status");
  const signOut = useCallback(async () => {
    await post("/auth/logout");
    onSignedOut();
  }, [onSignedOut]);
  const accounts = useAccounts(status.data, status.reload);
  const session: Session = {
    user,
    status: status.data,
    refreshStatus: status.reload,
    ...accounts,
    signOut,
  };
  return (
    <SessionProvider session={session}>
      <Shell />
    </SessionProvider>
  );
}

function Shell() {
  const { generation } = useSession();
  const [open, setOpen] = useState(false);
  return (
    <div className="app">
      <button className="btn menu-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        Menu
      </button>
      <Sidebar open={open} onNavigate={() => setOpen(false)} />
      <main className="main" key={generation}>
        <DemoBanner />
        <AppRoutes />
      </main>
    </div>
  );
}
