import { useState } from "react";
import { del, patch, post } from "../lib/api";
import { formatChange, formatDate, formatNumber, formatPercent, formatPeriod } from "../lib/format";
import { inDays, today, useForm } from "../lib/forms";
import { useResource } from "../lib/hooks";
import { DateRangeFields, Empty, ErrorBox, Field, Loading, PageHead } from "../components/ui";

interface ExperimentView {
  id: string;
  name: string;
  hypothesis: string;
  variable: string;
  metric: string;
  baseline: number | null;
  startDate: string;
  endDate: string;
  status: string;
  conclusion: string;
  evaluation: {
    baseline: number | null;
    observed: number | null;
    change: { percent: number | null };
    sampleSize: number;
    baselineSampleSize: number | null;
    baselinePeriod: { from: string; to: string } | null;
    verdict: string;
  };
}

const METRICS: Record<string, string> = {
  engagements: "Engagements per post",
  impressions: "Impressions per post",
  engagement_rate: "Engagement rate per post",
  comments: "Comments per post",
  reactions: "Reactions per post",
  reposts: "Reposts per post",
};

const VERDICT: Record<string, string> = {
  insufficient_data: "Not enough posts yet (needs 3 on each side)",
  higher: "Higher than baseline",
  lower: "Lower than baseline",
  no_clear_change: "No clear change (under 10%)",
};

const show = (metric: string, v: number | null) =>
  metric === "engagement_rate" ? formatPercent(v, 2) : formatNumber(v);

export function ExperimentsPage() {
  const list = useResource<{ items: ExperimentView[] }>("/experiments");
  const form = useForm(
    {
      name: "",
      hypothesis: "",
      variable: "",
      metric: "engagements",
      baseline: "",
      startDate: today(),
      endDate: inDays(28),
    },
    async (v) => {
      await post("/experiments", {
        ...v,
        baseline: v.baseline === "" ? null : Number(v.baseline),
        status: "running",
      });
      list.reload();
    },
  );
  return (
    <div className="stack">
      <PageHead
        title="Experiments"
        intro="Try one change and compare your posts during the experiment with the period before. This is a rule of thumb, not a statistical test."
      />
      <form className="card stack" onSubmit={form.submit}>
        <h2>New experiment</h2>
        <div className="form-grid">
          <Field label="Name">
            <input required maxLength={200} {...form.field("name")} placeholder="Morning posts" />
          </Field>
          <Field label="What you will change">
            <input maxLength={500} {...form.field("variable")} placeholder="Post before 9:00" />
          </Field>
          <Field label="Measure">
            <select {...form.field("metric")}>
              {Object.entries(METRICS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Baseline (blank = the period before)">
            <input type="number" step="any" {...form.field("baseline")} />
          </Field>
          <DateRangeFields start={form.field("startDate")} end={form.field("endDate")} />
        </div>
        <Field label="Hypothesis">
          <textarea
            required
            maxLength={2000}
            {...form.field("hypothesis")}
            placeholder="Posting before 9:00 gets more engagement because..."
          />
        </Field>
        <ErrorBox error={form.error} />
        <div>
          <button className="btn primary" disabled={form.busy}>
            Start experiment
          </button>
        </div>
      </form>
      {!list.data ? (
        <Loading />
      ) : list.data.items.length === 0 ? (
        <Empty title="No experiments yet" />
      ) : (
        list.data.items.map((e) => (
          <ExperimentCard key={e.id} experiment={e} onChange={list.reload} />
        ))
      )}
    </div>
  );
}

function ExperimentCard({
  experiment: e,
  onChange,
}: {
  experiment: ExperimentView;
  onChange: () => void;
}) {
  const ev = e.evaluation;
  const [concluding, setConcluding] = useState(false);
  const [conclusion, setConclusion] = useState(e.conclusion);
  const conclude = () =>
    void patch(`/experiments/${e.id}`, { status: "completed", conclusion }).then(onChange);
  return (
    <article className="card stack">
      <header>
        <h2>{e.name}</h2>
        <span className="badge">{e.status}</span>
      </header>
      <p style={{ margin: 0 }}>{e.hypothesis}</p>
      <div className="small secondary">
        {e.variable && `Change: ${e.variable}. `}
        {METRICS[e.metric]}, {formatDate(e.startDate)} to {formatDate(e.endDate)}
      </div>
      <div className="grid kpis">
        <div>
          <div className="kpi-label">
            Baseline
            {ev.baselinePeriod
              ? ` (${formatPeriod(ev.baselinePeriod)}, ${ev.baselineSampleSize} posts)`
              : " (set by you)"}
          </div>
          <strong>{show(e.metric, ev.baseline)}</strong>
        </div>
        <div>
          <div className="kpi-label">During ({ev.sampleSize} posts)</div>
          <strong>{show(e.metric, ev.observed)}</strong>
        </div>
        <div>
          <div className="kpi-label">Result</div>
          <strong>{VERDICT[ev.verdict]}</strong> {formatChange(ev.change.percent)}
        </div>
      </div>
      {e.conclusion && (
        <p className="small">
          <strong>Conclusion:</strong> {e.conclusion}
        </p>
      )}
      {concluding && (
        <div className="stack">
          <Field label="What did you conclude?">
            <textarea
              maxLength={5000}
              value={conclusion}
              onChange={(ev) => setConclusion(ev.target.value)}
            />
          </Field>
          <div className="row">
            <button className="btn small primary" onClick={conclude}>
              Save conclusion
            </button>
            <button className="btn small" onClick={() => setConcluding(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="row">
        {e.status !== "completed" && !concluding && (
          <button className="btn small" onClick={() => setConcluding(true)}>
            Conclude
          </button>
        )}
        <button
          className="btn small danger"
          onClick={() => del(`/experiments/${e.id}`).then(onChange)}
        >
          Delete
        </button>
      </div>
    </article>
  );
}
