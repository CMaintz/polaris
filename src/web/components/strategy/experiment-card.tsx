import { useState } from "react";
import type { ExperimentDto } from "../../../shared/planning-types";
import { del, patch } from "../../lib/api";
import { formatChange, formatDate, formatPeriod } from "../../lib/format";
import { useMutation } from "../../lib/hooks/mutation";
import { experimentMetricLabel, formatMetric } from "../../lib/metrics";
import { ErrorBox } from "../common/feedback";
import { Field } from "../common/fields";

const VERDICT: Record<ExperimentDto["evaluation"]["verdict"], string> = {
  insufficient_data: "Not enough posts yet (needs 3 on each side)",
  higher: "Higher than baseline",
  lower: "Lower than baseline",
  no_clear_change: "No clear change (under 10%)",
};

export function ExperimentCard({
  experiment: e,
  onChange,
}: {
  experiment: ExperimentDto;
  onChange: () => void;
}) {
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
      <Evaluation experiment={e} />
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

function Evaluation({ experiment: e }: { experiment: ExperimentDto }) {
  const ev = e.evaluation;
  return (
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
  );
}
