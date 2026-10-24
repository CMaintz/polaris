import { useCallback, useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import type { ImportStatusDto, UserDto } from "../shared/api-types";
import { api, del, isUnauthorized, post } from "./lib/api";
import { useResource } from "./lib/hooks";
import { useMutation } from "./lib/mutation";
import { type Session, SessionProvider, useSession } from "./lib/session";
import { ErrorBox } from "./components/ui";
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
import { ApprovalsPage } from "./pages/Approvals";
import { CampaignsPage } from "./pages/Campaigns";
import { StudioPage } from "./pages/Studio";
import { ResearchPage } from "./pages/Research";
import { SearchPage } from "./pages/Search";
import { TrendsPage } from "./pages/Trends";
import { ThemesPage } from "./pages/Themes";
import { FunnelPage } from "./pages/Funnel";
import { StrategyPage } from "./pages/Strategy";

const NAV: { title: string; links: [string, string][] }[] = [
  {
    title: "Intelligence",
    links: [
      ["/", "Overview"],
      ["/content", "Content"],
      ["/search", "Search"],
      ["/themes", "Themes"],
      ["/analytics", "Analytics"],
      ["/audience", "Audience"],
      ["/insights", "AI insights"],
      ["/research", "Research"],
      ["/trends", "Trends"],
    ],
  },
  {
    title: "Strategy",
    links: [
      ["/strategy", "Pillars"],
      ["/campaigns", "Campaigns"],
      ["/funnel", "Funnel"],
      ["/goals", "Goals"],
      ["/experiments", "Experiments"],
    ],
  },
  {
    title: "Action",
    links: [
      ["/planner", "Planner"],
      ["/studio", "Studio"],
      ["/approvals", "Approvals"],
    ],
  },
  { title: "Polaris", links: [["/settings", "Settings"]] },
];

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
  const session: Session = { user, status: status.data, refreshStatus: status.reload, signOut };
  return (
    <SessionProvider session={session}>
      <Shell />
    </SessionProvider>
  );
}

function DemoBanner() {
  const { status, refreshStatus } = useSession();
  const remove = useMutation(() => del("/imports/demo"), refreshStatus);
  if (!status?.hasDemoData) return null;
  return (
    <div className="banner demo" role="note">
      <span>
        <strong>Demo data.</strong> Everything here is synthetic, not your LinkedIn account.
        Importing your own data replaces it.
      </span>
      <button className="btn small" disabled={remove.busy} onClick={() => remove.run()}>
        Remove demo data
      </button>
      <ErrorBox error={remove.error} />
    </div>
  );
}

function Shell() {
  const { user, signOut } = useSession();
  const signingOut = useMutation(signOut);
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
        {NAV.map(({ title, links }) => (
          <div key={title} className="nav-group">
            <div className="nav-group-title">{title}</div>
            {links.map(([to, label]) => (
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
          </div>
        ))}
        <div className="sidebar-footer">
          <div>{user.email}</div>
          <button
            className="btn small"
            style={{ marginTop: 8 }}
            disabled={signingOut.busy}
            onClick={() => signingOut.run()}
          >
            Sign out
          </button>
          <ErrorBox error={signingOut.error} />
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
          <Route path="/research" element={<ResearchPage />} />
          <Route path="/trends" element={<TrendsPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/themes" element={<ThemesPage />} />
          <Route path="/strategy" element={<StrategyPage />} />
          <Route path="/campaigns" element={<CampaignsPage />} />
          <Route path="/funnel" element={<FunnelPage />} />
          <Route path="/studio" element={<StudioPage />} />
          <Route path="/approvals" element={<ApprovalsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
