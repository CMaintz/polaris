import type { GoalDto } from "../../shared/planning-types";
import { del, post } from "../lib/api";
import { formatDate, formatPercent } from "../lib/format";
import { ErrorBox } from "../components/common/feedback";
import { DateRangeFields, Field } from "../components/common/fields";
import { Empty, PageHead } from "../components/common/layout";
import { Meter } from "../components/common/meter";
import { MetricValueFields } from "../components/common/metric-fields";
import { ResourceView } from "../components/common/resource-view";
import { inDays, today } from "../lib/dates";
import { useForm } from "../lib/hooks/form";
import { useMutation } from "../lib/hooks/mutation";
import { useResource } from "../lib/hooks/resource";
import { GOAL_METRICS, formatMetric, goalMetricLabel, parseMetricInput } from "../lib/metrics";

const STATUS: Record<GoalDto["progress"]["status"], string> = {
  not_started: "Not started",
  no_data: "No data for this period yet",
  on_track: "On track",
  behind: "Behind",
  achieved: "Achieved",
  missed: "Missed",
};

const isRate = (metric: GoalDto["metric"]) => metric === "engagement_rate";

export function GoalsPage() {
  const goals = useResource<{ items: GoalDto[] }>("/goals");
  const form = useForm(
    {
      name: "",
      metric: "impressions" as GoalDto["metric"],
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
          <MetricValueFields
            options={GOAL_METRICS}
            metric={form.field("metric")}
            metricLabel="Metric"
            valueLabel="Target"
            value={{ ...form.field("target"), required: true, min: "0" }}
          />
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

function GoalCard({ goal, onDeleted }: { goal: GoalDto; onDeleted: () => void }) {
  const p = goal.progress;
  const remove = useMutation(() => del(`/goals/${goal.id}`), onDeleted);
  return (
    <article className="card stack">
      <header>
        <h2>{goal.name}</h2>
        <span className="badge">{STATUS[p.status]}</span>
      </header>
      <div className="secondary small">
        {goalMetricLabel(goal.metric)}: target {formatMetric(goal.metric, goal.target)},{" "}
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
