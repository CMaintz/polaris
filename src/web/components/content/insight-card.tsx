import type { InsightDto } from "../../../shared/ai-types";
import { EvidenceList } from "./evidence-list";

const CONFIDENCE: Record<string, string> = {
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
};

/**
 * docs/03 s5 and docs/08: an insight shows its observation, interpretation and suggested
 * action, and its evidence is always one click away, with sources. Never an opaque "AI says".
 */
export function InsightCard({ insight }: { insight: InsightDto }) {
  return (
    <article className="card insight">
      <header>
        <h3>{insight.title}</h3>
        <div className="row">
          <span className={`badge${insight.origin === "ai" ? " ai" : ""}`}>
            {insight.origin === "ai" ? "AI interpretation" : "Rule"}
          </span>
          <span className="badge">{CONFIDENCE[insight.confidence]}</span>
          {insight.basedOnDemoData && <span className="badge">Demo data</span>}
        </div>
      </header>
      <p style={{ margin: 0 }}>{insight.observation}</p>
      <dl>
        <dt>Why it may matter</dt>
        <dd>{insight.interpretation}</dd>
        <dt>Could try</dt>
        <dd>{insight.action}</dd>
        <dt>Watch</dt>
        <dd>{insight.signal}</dd>
      </dl>
      <details>
        <summary>Evidence ({insight.evidence.length})</summary>
        <EvidenceList
          evidence={insight.evidence}
          empty="No measured evidence supports this. Treat it as a guess."
        />
      </details>
    </article>
  );
}
