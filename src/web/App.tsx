import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import type { UserDto } from "../shared/api-types";
import { ApiError, api, del, post } from "./lib/api";
import { useResource } from "./lib/hooks";
import { AnalyticsPage } from "./pages/Analytics";
import { AudiencePage } from "./pages/Audience";
import { ContentPage } from "./pages/Content";
import { ExperimentsPage } from "./pages/Experiments";
import { GoalsPage } from "./pages/Goals";
import { InsightsPage } from "./pages/Insights";
import { LoginPage } from "./pages/Login";
import { OverviewPage } from "./pages/Overview";
import { PlannerPage } from "./pages/Planner";
import { PostDetailPage } from "./pages/PostDetail";
import { SettingsPage } from "./pages/Settings";

interface DataStatus {
  hasLinkedInData: boolean;
  hasDemoData: boolean;
}

interface Session {
  user: UserDto;
  status: DataStatus | null;
  refreshStatus: () => void;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession outside the signed-in app");
  return session;
}

const NAV = [
  ["/", "Overview"],
  ["/content", "Content"],
  ["/analytics", "Analytics"],
  ["/audience", "Audience"],
  ["/insights", "AI insights"],
  ["/planner", "Planner"],
  ["/goals", "Goals"],
  ["/experiments", "Experiments"],
  ["/settings", "Settings"],
] as const;

export function App() {
  const [user, setUser] = useState<UserDto | null | undefined>(undefined);
  useEffect(() => {
    api<{ user: UserDto }>("/auth/me")
      .then((r) => setUser(r.user))
      .catch((e: unknown) => setUser(e instanceof ApiError && e.status === 401 ? null : null));
  }, []);
  if (user === undefined) return <div className="auth-shell muted">Loading...</div>;
  if (user === null) return <LoginPage onSignedIn={setUser} />;
  return <SignedIn user={user} onSignedOut={() => setUser(null)} />;
}

function SignedIn({ user, onSignedOut }: { user: UserDto; onSignedOut: () => void }) {
  const status = useResource<DataStatus>("/imports/status");
  const signOut = useCallback(async () => {
    await post("/auth/logout");
    onSignedOut();
  }, [onSignedOut]);
  const session: Session = { user, status: status.data, refreshStatus: status.reload, signOut };
  return (
    <SessionContext.Provider value={session}>
      <Shell />
    </SessionContext.Provider>
  );
}

function DemoBanner() {
  const { status, refreshStatus } = useSession();
  if (!status?.hasDemoData) return null;
  return (
    <div className="banner demo" role="note">
      <span>
        <strong>Demo data.</strong> Everything here is synthetic, not your LinkedIn account.
        Importing your own data replaces it.
      </span>
      <button className="btn small" onClick={() => del("/imports/demo").then(refreshStatus)}>
        Remove demo data
      </button>
    </div>
  );
}

function Shell() {
  const { user, signOut } = useSession();
  const [open, setOpen] = useState(false);
  return (
    <div className="app">
      <button className="btn menu-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        Menu
      </button>
      <nav className={`sidebar${open ? " open" : ""}`} aria-label="Main">
        <div className="brand" aria-label="Polaris">
          <svg width="20" height="20" viewBox="0 0 32 32" aria-hidden>
            <path
              d="M16 2l3.5 10.5L30 16l-10.5 3.5L16 30l-3.5-10.5L2 16l10.5-3.5z"
              fill="var(--accent)"
            />
          </svg>
          Polaris
        </div>
        {NAV.map(([to, label]) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            onClick={() => setOpen(false)}
          >
            {label}
          </NavLink>
        ))}
        <div className="sidebar-footer">
          <div>{user.email}</div>
          <button className="btn small" style={{ marginTop: 8 }} onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </nav>
      <main className="main">
        <DemoBanner />
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/content" element={<ContentPage />} />
          <Route path="/content/:id" element={<PostDetailPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/audience" element={<AudiencePage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/planner" element={<PlannerPage />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/experiments" element={<ExperimentsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
