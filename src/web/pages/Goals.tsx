import { del, post } from "../lib/api";
import { formatDate, formatPercent } from "../lib/format";
import { inDays, today, useForm } from "../lib/forms";
import { useResource } from "../lib/hooks";
import {
  type MetricKey,
  formatMetric,
  metricInputLabel,
  metricLabel,
  metricOptions,
  parseMetricInput,
} from "../lib/metrics";
import { useMutation } from "../lib/mutation";
import { ResourceView } from "../components/resource";
import { DateRangeFields, Empty, ErrorBox, Field, Meter, PageHead } from "../components/ui";

interface GoalView {
  id: string;
  name: string;
  metric: MetricKey;
  target: number;
  startDate: string;
  endDate: string;
  notes: string;
  progress: {
    current: number | null;
    baseline: number | null;
    progress: number | null;
    expected: number;
    status: string;
    measuredUntil: string;
  };
}

const MEASURED_AS: Partial<Record<MetricKey, string>> = {
  followers: "reach a total",
  impressions: "total over the period",
  engagements: "total over the period",
};
const goalLabel = (key: MetricKey) =>
  MEASURED_AS[key] ? `${metricLabel(key)} (${MEASURED_AS[key]})` : metricLabel(key);
const METRICS = metricOptions(
  ["followers", "impressions", "engagements", "posts", "engagement_rate"],
  goalLabel,
);

const STATUS: Record<string, string> = {
  not_started: "Not started",
  no_data: "No data for this period yet",
  on_track: "On track",
  behind: "Behind",
  achieved: "Achieved",
  missed: "Missed",
};

const isRate = (metric: MetricKey) => metric === "engagement_rate";

export function GoalsPage() {
  const goals = useResource<{ items: GoalView[] }>("/goals");
  const form = useForm(
    {
      name: "",
      metric: "impressions" as MetricKey,
      target: "",
      startDate: today(),
      endDate: inDays(90),
      notes: "",
    },
    async (v) => {
      await post("/goals", { ...v, target: parseMetricInput(v.metric, v.target) });
      goals.reload();
    },
  );
  return (
    <div className="stack">
      <PageHead
        title="Goals"
        intro="Targets measured against your imported data. Progress updates with every import."
      />
      <form className="card stack" onSubmit={form.submit}>
        <h2>New goal</h2>
        <div className="form-grid">
          <Field label="Name">
            <input
              required
              maxLength={200}
              {...form.field("name")}
              placeholder="Grow reach this quarter"
            />
          </Field>
          <Field label="Metric">
            <select {...form.field("metric")}>
              {METRICS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={metricInputLabel(form.values.metric, "Target")}>
            <input required type="number" min="0" step="any" {...form.field("target")} />
          </Field>
          <DateRangeFields start={form.field("startDate")} end={form.field("endDate")} />
        </div>
        <Field label="Notes">
          <textarea maxLength={5000} {...form.field("notes")} />
        </Field>
        <ErrorBox error={form.error} />
        <div>
          <button className="btn primary" disabled={form.busy}>
            Add goal
          </button>
        </div>
      </form>
      <ResourceView resource={goals}>
        {({ items }) =>
          items.length === 0 ? (
            <Empty title="No goals yet" />
          ) : (
            items.map((g) => <GoalCard key={g.id} goal={g} onDeleted={goals.reload} />)
          )
        }
      </ResourceView>
    </div>
  );
}

function GoalCard({ goal, onDeleted }: { goal: GoalView; onDeleted: () => void }) {
  const p = goal.progress;
  const remove = useMutation(() => del(`/goals/${goal.id}`), onDeleted);
  return (
    <article className="card stack">
      <header>
        <h2>{goal.name}</h2>
        <span className="badge">{STATUS[p.status] ?? p.status}</span>
      </header>
      <div className="secondary small">
        {goalLabel(goal.metric)}: target {formatMetric(goal.metric, goal.target)},{" "}
        {formatDate(goal.startDate)} to {formatDate(goal.endDate)}
      </div>
      <Meter value={p.progress} behind={p.status === "behind"} />
      <div className="small">
        Now {formatMetric(goal.metric, p.current)}
        {p.baseline !== null && ` (started at ${formatMetric(goal.metric, p.baseline)})`},{" "}
        {formatPercent(p.progress, 0)} of the way there
        {!isRate(goal.metric) && `, ${formatPercent(p.expected, 0)} of the time used`}. Measured up
        to {formatDate(p.measuredUntil)}.
      </div>
      {goal.notes && (
        <p className="secondary small" style={{ whiteSpace: "pre-wrap" }}>
          {goal.notes}
        </p>
      )}
      <ErrorBox error={remove.error} />
      <div>
        <button className="btn small danger" disabled={remove.busy} onClick={() => remove.run()}>
          Delete
        </button>
      </div>
    </article>
  );
}
