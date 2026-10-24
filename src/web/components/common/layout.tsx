import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function PageHead({
  title,
  intro,
  actions,
}: {
  title: string;
  intro?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {intro && <p>{intro}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card empty">
      <h2>{title}</h2>
      {children && <div style={{ marginTop: 8 }}>{children}</div>}
    </div>
  );
}

/** The empty state docs/08 asks for: say what is needed next, and link to it. */
export function NeedsData() {
  return (
    <Empty title="No data yet">
      <p>Import your LinkedIn exports, or load the demo data to look around first.</p>
      <Link className="btn primary" to="/settings">
        Go to imports
      </Link>
    </Empty>
  );
}
