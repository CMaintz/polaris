import { NavLink } from "react-router-dom";
import { useMutation } from "../../lib/hooks/mutation";
import { useSession } from "../../lib/session";
import { AccountSwitcher } from "../accounts/account-switcher";
import { ErrorBox } from "../common/feedback";

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
      ["/compare", "Compare accounts"],
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

/** `onNavigate` runs on every link click, so the parent can close the menu. */
export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const { user, signOut } = useSession();
  const signingOut = useMutation(signOut);
  return (
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
      <AccountSwitcher />
      {NAV.map(({ title, links }) => (
        <div key={title} className="nav-group">
          <div className="nav-group-title">{title}</div>
          {links.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
              onClick={onNavigate}
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
  );
}
