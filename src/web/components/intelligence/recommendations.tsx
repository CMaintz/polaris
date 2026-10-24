import type { RecommendationDto as Recommendation } from "../../../shared/ai-types";
import { patch } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { useMutation } from "../../lib/hooks/mutation";
import { CitedEvidence } from "../content/evidence-list";
import { ErrorBox } from "../common/feedback";

const STATUS_ACTIONS: [Recommendation["status"], string][] = [
  ["accepted", "Accept"],
  ["done", "Mark done"],
  ["dismissed", "Dismiss"],
];

export function Recommendations({
  items,
  onChange,
}: {
  items: Recommendation[];
  onChange: () => void;
}) {
  const open = items.filter((r) => r.status === "open" || r.status === "accepted");
  if (items.length === 0) return null;
  return (
    <section className="card">
      <h2>Recommendations</h2>
      {open.length === 0 && <p className="muted">All recommendations are done or dismissed.</p>}
      <ul style={{ listStyle: "none", padding: 0 }} className="stack">
        {open.map((r) => (
          <li key={r.id}>
            <RecommendationItem item={r} onChange={onChange} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecommendationItem({ item: r, onChange }: { item: Recommendation; onChange: () => void }) {
  const setStatus = useMutation(
    (status: Recommendation["status"]) => patch(`/ai/recommendations/${r.id}`, { status }),
    onChange,
  );
  return (
    <>
      <strong>{r.recommendation}</strong>{" "}
      {r.status === "accepted" && <span className="badge">Accepted</span>}
      {r.basedOnDemo && <span className="badge">Demo data</span>}
      <div className="small secondary">{r.rationale}</div>
      <CitedEvidence evidence={r.evidence} />
      <ErrorBox error={setStatus.error} />
      <div className="row" style={{ marginTop: 6 }}>
        {STATUS_ACTIONS.filter(([s]) => s !== r.status).map(([status, label]) => (
          <button
            key={status}
            className="btn small"
            disabled={setStatus.busy}
            onClick={() => setStatus.run(status)}
          >
            {label}
          </button>
        ))}
        <span className="muted small">{formatDate(r.createdAt.slice(0, 10))}</span>
      </div>
    </>
  );
}
