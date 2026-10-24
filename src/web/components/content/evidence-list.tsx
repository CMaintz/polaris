import { Link } from "react-router-dom";
import type { EvidenceDto } from "../../../shared/ai-types";
import { formatPeriod, formatValue } from "../../lib/format";

/** `empty` is shown instead of the list, so a claim without evidence says so. */
export function EvidenceList({ evidence, empty }: { evidence: EvidenceDto[]; empty: string }) {
  if (evidence.length === 0) return <p className="muted small">{empty}</p>;
  return (
    <ul className="small">
      {evidence.map((e) => (
        <li key={e.id}>
          {e.label}: <strong>{formatValue(e.value, e.unit)}</strong>
          {e.period && ` (${formatPeriod(e.period)})`}{" "}
          <span className="muted">from {e.source}</span>
          {e.postId && (
            <>
              {" "}
              <Link to={`/content/${e.postId}`}>open post</Link>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Evidence behind an AI answer or recommendation, open by default when there is any. */
export function CitedEvidence({ evidence }: { evidence: EvidenceDto[] }) {
  const empty = "The answer cited no measured evidence.";
  if (evidence.length === 0) return <EvidenceList evidence={evidence} empty={empty} />;
  return (
    <details open>
      <summary>Evidence</summary>
      <EvidenceList evidence={evidence} empty={empty} />
    </details>
  );
}
