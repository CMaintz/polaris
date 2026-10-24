import type { ExperimentDto } from "../../../shared/planning-types";
import { post } from "../../lib/api";
import { inDays, today } from "../../lib/dates";
import { useForm } from "../../lib/hooks/form";
import { EXPERIMENT_METRICS, parseMetricInput } from "../../lib/metrics";
import { ErrorBox } from "../common/feedback";
import { DateRangeFields, Field } from "../common/fields";
import { MetricValueFields } from "../common/metric-fields";

export function ExperimentForm({ onCreated }: { onCreated: () => void }) {
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
      onCreated();
    },
  );
  return (
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
  );
}
