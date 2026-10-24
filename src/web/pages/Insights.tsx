import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import type {
  AnswerDto as Answer,
  EvidenceDto,
  InsightDto,
  RecommendationDto as Recommendation,
} from "../../shared/api-types";
import { patch } from "../lib/api";
import { formatDate } from "../lib/format";
import { useResource, useStartJob } from "../lib/hooks";
import { useMutation } from "../lib/mutation";
import { EvidenceList, InsightCard } from "../components/content";
import { ResourceView } from "../components/resource";
import { ErrorBox, JobLine, PageHead } from "../components/ui";

export function InsightsPage() {
  const insights = useResource<{ insights: InsightDto[] }>("/ai/insights?scope=account");
  const recs = useResource<{ recommendations: Recommendation[] }>("/ai/recommendations");
  const keys = useResource<{ credentials: unknown[] }>("/ai/credentials");
  const review = useStartJob(() => {
    insights.reload();
    recs.reload();
  });
  const hasKey = (keys.data?.credentials.length ?? 0) > 0;

  return (
    <div className="stack">
      <PageHead
        title="AI insights"
        intro="Interpretation by your own AI provider, grounded in your measured data. Every claim links to its evidence."
        actions={
          <button
            className="btn primary"
            disabled={!hasKey || review.running}
            onClick={() => review.start("/ai/reviews/account", {})}
          >
            Review my account
          </button>
        }
      />
      {keys.data && !hasKey && (
        <div className="banner error">
          <span>
            No AI key yet. <Link to="/settings">Add an OpenAI or Anthropic key in Settings</Link>.
          </span>
        </div>
      )}
      <p className="small secondary">
        A review sends aggregate metrics, your top and weakest posts (including their text) and
        segment medians to your provider. Nothing else leaves Polaris.
      </p>
      <ErrorBox error={keys.error} />
      <ErrorBox error={review.error} />
      <JobLine job={review.job} />
      <Ask disabled={!hasKey} />
      <ResourceView resource={recs}>
        {(data) => <Recommendations items={data.recommendations} onChange={recs.reload} />}
      </ResourceView>
      <section className="stack">
        <h2>Account insights</h2>
        <ResourceView resource={insights}>
          {(data) => <AccountInsights insights={data.insights} />}
        </ResourceView>
      </section>
    </div>
  );
}

function AccountInsights({ insights }: { insights: InsightDto[] }) {
  if (insights.length === 0)
    return <p className="muted">No AI reviews yet. Rule-based insights are on the Overview.</p>;
  return (
    <div className="grid two">
      {insights.map((i) => (
        <InsightCard key={i.id} insight={i} />
      ))}
    </div>
  );
}

function Ask({ disabled }: { disabled: boolean }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const ask = useStartJob((job) =>
    setAnswer(job.status === "completed" ? (job.result as Answer) : null),
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setAnswer(null);
    ask.start("/ai/questions", { question });
  };
  return (
    <form className="card stack" onSubmit={submit}>
      <h2>Ask about your data</h2>
      <div className="row">
        <input
          style={{ flex: 1 }}
          value={question}
          maxLength={500}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Which topics get the most comments?"
        />
        <button className="btn primary" disabled={disabled || ask.running || !question.trim()}>
          Ask
        </button>
      </div>
      <ErrorBox error={ask.error} />
      <JobLine job={ask.job?.status === "completed" ? null : ask.job} />
      {answer && (
        <div>
          <p style={{ whiteSpace: "pre-wrap" }}>{answer.answer}</p>
          {answer.caveats.length > 0 && (
            <ul className="small secondary">
              {answer.caveats.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
          <CitedEvidence evidence={answer.evidence} />
        </div>
      )}
    </form>
  );
}

function CitedEvidence({ evidence }: { evidence: EvidenceDto[] }) {
  const empty = "The answer cited no measured evidence.";
  if (evidence.length === 0) return <EvidenceList evidence={evidence} empty={empty} />;
  return (
    <details open>
      <summary>Evidence</summary>
      <EvidenceList evidence={evidence} empty={empty} />
    </details>
  );
}

const STATUS_ACTIONS: [Recommendation["status"], string][] = [
  ["accepted", "Accept"],
  ["done", "Mark done"],
  ["dismissed", "Dismiss"],
];

function Recommendations({ items, onChange }: { items: Recommendation[]; onChange: () => void }) {
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
