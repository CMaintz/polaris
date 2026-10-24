import { useState } from "react";
import type { ExperimentDto } from "../../shared/api-types";
import { del, patch, post } from "../lib/api";
import { formatChange, formatDate, formatPeriod } from "../lib/format";
import { inDays, today, useForm } from "../lib/forms";
import { useResource } from "../lib/hooks";
import {
  EXPERIMENT_METRICS,
  experimentMetricLabel,
  formatMetric,
  parseMetricInput,
} from "../lib/metrics";
import { useMutation } from "../lib/mutation";
import { MetricValueFields } from "../components/metric-fields";
import { ResourceView } from "../components/resource";
import { DateRangeFields, Empty, ErrorBox, Field, PageHead } from "../components/ui";

const VERDICT: Record<ExperimentDto["evaluation"]["verdict"], string> = {
  insufficient_data: "Not enough posts yet (needs 3 on each side)",
  higher: "Higher than baseline",
  lower: "Lower than baseline",
  no_clear_change: "No clear change (under 10%)",
};

export function ExperimentsPage() {
  const list = useResource<{ items: ExperimentDto[] }>("/experiments");
  const form = useForm(
    {
      name: "",
      hypothesis: "",
      variable: "",
      metric: "engagements" as ExperimentDto["metric"],
      baseline: "",
      startDate: today(),
      endDate: inDays(28),
    },
    async (v) => {
      await post("/experiments", {
        ...v,
        baseline: parseMetricInput(v.metric, v.baseline),
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
          <MetricValueFields
            options={EXPERIMENT_METRICS}
            metric={form.field("metric")}
            metricLabel="Measure"
            valueLabel="Baseline"
            hint="blank for the period before"
            value={form.field("baseline")}
          />
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
      <ResourceView resource={list}>
        {({ items }) =>
          items.length === 0 ? (
            <Empty title="No experiments yet" />
          ) : (
            items.map((e) => <ExperimentCard key={e.id} experiment={e} onChange={list.reload} />)
          )
        }
      </ResourceView>
    </div>
  );
}

function ExperimentCard({
  experiment: e,
  onChange,
}: {
  experiment: ExperimentDto;
  onChange: () => void;
}) {
  const ev = e.evaluation;
  const [concluding, setConcluding] = useState(false);
  const [conclusion, setConclusion] = useState(e.conclusion);
  const conclude = useMutation(
    () => patch(`/experiments/${e.id}`, { status: "completed", conclusion }),
    () => {
      setConcluding(false);
      onChange();
    },
  );
  const remove = useMutation(() => del(`/experiments/${e.id}`), onChange);
  const busy = conclude.busy || remove.busy;
  return (
    <article className="card stack">
      <header>
        <h2>{e.name}</h2>
        <span className="badge">{e.status}</span>
      </header>
      <p style={{ margin: 0 }}>{e.hypothesis}</p>
      <div className="small secondary">
        {e.variable && `Change: ${e.variable}. `}
        {experimentMetricLabel(e.metric)}, {formatDate(e.startDate)} to {formatDate(e.endDate)}
      </div>
      <div className="grid kpis">
        <div>
          <div className="kpi-label">
            Baseline
            {ev.baselinePeriod
              ? ` (${formatPeriod(ev.baselinePeriod)}, ${ev.baselineSampleSize} posts)`
              : " (set by you)"}
          </div>
          <strong>{formatMetric(e.metric, ev.baseline)}</strong>
        </div>
        <div>
          <div className="kpi-label">During ({ev.sampleSize} posts)</div>
          <strong>{formatMetric(e.metric, ev.observed)}</strong>
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
            <button className="btn small primary" disabled={busy} onClick={() => conclude.run()}>
              Save conclusion
            </button>
            <button className="btn small" onClick={() => setConcluding(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <ErrorBox error={conclude.error ?? remove.error} />
      <div className="row">
        {e.status !== "completed" && !concluding && (
          <button className="btn small" onClick={() => setConcluding(true)}>
            Conclude
          </button>
        )}
        <button className="btn small danger" disabled={busy} onClick={() => remove.run()}>
          Delete
        </button>
      </div>
    </article>
  );
}
