import type { ProposalDto } from "../../../shared/action-types";
import { formatDate } from "../../lib/format";
import { usePost } from "../../lib/hooks/mutation";
import { ErrorBox } from "../common/feedback";
import { EvidenceList } from "../content/evidence-list";
import { PROPOSAL_KIND, proposalSummary } from "./proposal-labels";

export function ProposalCard({
  proposal: p,
  onChange,
}: {
  proposal: ProposalDto;
  onChange: () => void;
}) {
  const approve = usePost(`/action/proposals/${p.id}/approve`, onChange);
  const reject = usePost(`/action/proposals/${p.id}/reject`, onChange);
  const busy = approve.busy || reject.busy;
  return (
    <article className="card stack" aria-label={`${PROPOSAL_KIND[p.kind]}: ${proposalSummary(p)}`}>
      <header className="row">
        <span className="badge ai">AI</span>
        <span className="badge">{PROPOSAL_KIND[p.kind]}</span>
        {p.basedOnDemoData && <span className="badge">Demo data</span>}
        <strong>{proposalSummary(p)}</strong>
      </header>
      <PayloadFields proposal={p} />
      <p>
        <span className="muted">Why: </span>
        {p.rationale}
      </p>
      <EvidenceList evidence={p.evidence} empty="No evidence cited." />
      {p.error && <div className="banner error">{p.error}</div>}
      <ErrorBox error={approve.error ?? reject.error} />
      <div className="row">
        <button className="btn primary" disabled={busy} onClick={() => approve.run()}>
          {p.status === "failed" ? "Try again" : "Approve"}
        </button>
        <button className="btn" disabled={busy} onClick={() => reject.run()}>
          Reject
        </button>
      </div>
    </article>
  );
}

const LABELS: Record<string, string> = {
  concept: "Concept",
  targetTopic: "Topic",
  plannedDate: "Planned for",
  hypothesis: "Hypothesis",
  variable: "What changes",
  metric: "Measured by",
  startDate: "Starts",
  endDate: "Ends",
  target: "Target",
};

function PayloadFields({ proposal }: { proposal: ProposalDto }) {
  const entries = Object.entries(proposal.payload).filter(([k, v]) => k in LABELS && v !== "");
  return (
    <dl className="small">
      {entries.map(([key, value]) => (
        <div key={key} className="row">
          <dt className="muted">{LABELS[key]}</dt>
          <dd>{key.endsWith("Date") ? formatDate(String(value)) : String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}
