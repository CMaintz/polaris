import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import type { EvidenceDto, InsightDto, JobDto } from "../../shared/api-types";
import { patch, post, tzOffset } from "../lib/api";
import { formatDate, formatPeriod, formatValue } from "../lib/format";
import { useJob, useResource } from "../lib/hooks";
import { InsightCard } from "../components/content";
import { ErrorBox, JobLine, PageHead } from "../components/ui";

interface Recommendation {
  id: string;
  recommendation: string;
  rationale: string;
  evidence: EvidenceDto[];
  status: "open" | "accepted" | "dismissed" | "done";
  basedOnDemo: boolean;
  createdAt: string;
}

interface Answer {
  answer: string;
  caveats: string[];
  evidence: EvidenceDto[];
  basedOnDemoData: boolean;
}

function useStartJob(onDone: (job: JobDto) => void) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const job = useJob(jobId, onDone);
  const start = (path: string, body: object) => {
    setError(null);
    setJobId(null);
    post<{ job: JobDto }>(path, { ...body, tz: tzOffset() })
      .then((r) => setJobId(r.job.id))
      .catch(setError);
  };
  const running = job !== null && !["completed", "failed"].includes(job.status);
  return { job, error, start, running: running || (jobId !== null && job === null) };
}

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
      <ErrorBox error={review.error} />
      <JobLine job={review.job} />
      <Ask disabled={!hasKey} />
      <Recommendations items={recs.data?.recommendations ?? []} onChange={recs.reload} />
      <section className="stack">
        <h2>Account insights</h2>
        {insights.data?.insights.length ? (
          <div className="grid two">
            {insights.data.insights.map((i) => (
              <InsightCard key={i.id} insight={i} />
            ))}
          </div>
        ) : (
          <p className="muted">No AI reviews yet. Rule-based insights are on the Overview.</p>
        )}
      </section>
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
          <EvidenceList evidence={answer.evidence} />
        </div>
      )}
    </form>
  );
}

function EvidenceList({ evidence }: { evidence: EvidenceDto[] }) {
  if (evidence.length === 0)
    return <p className="small muted">The answer cited no measured evidence.</p>;
  return (
    <details open>
      <summary>Evidence</summary>
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
            <strong>{r.recommendation}</strong>{" "}
            {r.status === "accepted" && <span className="badge">Accepted</span>}
            {r.basedOnDemo && <span className="badge">Demo data</span>}
            <div className="small secondary">{r.rationale}</div>
            <EvidenceList evidence={r.evidence} />
            <div className="row" style={{ marginTop: 6 }}>
              {STATUS_ACTIONS.filter(([s]) => s !== r.status).map(([status, label]) => (
                <button
                  key={status}
                  className="btn small"
                  onClick={() => patch(`/ai/recommendations/${r.id}`, { status }).then(onChange)}
                >
                  {label}
                </button>
              ))}
              <span className="muted small">{formatDate(r.createdAt.slice(0, 10))}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
