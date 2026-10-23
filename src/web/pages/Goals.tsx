import { del, post } from "../lib/api";
import { formatDate, formatNumber, formatPercent } from "../lib/format";
import { inDays, today, useForm } from "../lib/forms";
import { useResource } from "../lib/hooks";
import {
  DateRangeFields,
  Empty,
  ErrorBox,
  Field,
  Loading,
  Meter,
  PageHead,
} from "../components/ui";

interface GoalView {
  id: string;
  name: string;
  metric: string;
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

const METRICS: Record<string, string> = {
  followers: "Followers (reach a total)",
  impressions: "Impressions (total over the period)",
  engagements: "Engagements (total over the period)",
  posts: "Posts published",
  engagement_rate: "Engagement rate (%)",
};

const STATUS: Record<string, string> = {
  not_started: "Not started",
  no_data: "No data for this period yet",
  on_track: "On track",
  behind: "Behind",
  achieved: "Achieved",
  missed: "Missed",
};

const isRate = (metric: string) => metric === "engagement_rate";
const show = (metric: string, value: number | null) =>
  isRate(metric) ? formatPercent(value, 2) : formatNumber(value);

export function GoalsPage() {
  const goals = useResource<{ items: GoalView[] }>("/goals");
  const form = useForm(
    {
      name: "",
      metric: "impressions",
      target: "",
      startDate: today(),
      endDate: inDays(90),
      notes: "",
    },
    async (v) => {
      const target = isRate(v.metric) ? Number(v.target) / 100 : Number(v.target);
      await post("/goals", { ...v, target });
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
              {Object.entries(METRICS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={isRate(form.values.metric) ? "Target (%)" : "Target"}>
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
      {!goals.data ? (
        <Loading />
      ) : goals.data.items.length === 0 ? (
        <Empty title="No goals yet" />
      ) : (
        goals.data.items.map((g) => (
          <GoalCard key={g.id} goal={g} onDelete={() => del(`/goals/${g.id}`).then(goals.reload)} />
        ))
      )}
    </div>
  );
}

function GoalCard({ goal, onDelete }: { goal: GoalView; onDelete: () => void }) {
  const p = goal.progress;
  return (
    <article className="card stack">
      <header>
        <h2>{goal.name}</h2>
        <span className="badge">{STATUS[p.status] ?? p.status}</span>
      </header>
      <div className="secondary small">
        {METRICS[goal.metric]}: target {show(goal.metric, goal.target)},{" "}
        {formatDate(goal.startDate)} to {formatDate(goal.endDate)}
      </div>
      <Meter value={p.progress} behind={p.status === "behind"} />
      <div className="small">
        Now {show(goal.metric, p.current)}
        {p.baseline !== null && ` (started at ${show(goal.metric, p.baseline)})`},{" "}
        {formatPercent(p.progress, 0)} of the way there
        {!isRate(goal.metric) && `, ${formatPercent(p.expected, 0)} of the time used`}. Measured up
        to {formatDate(p.measuredUntil)}.
      </div>
      {goal.notes && (
        <p className="secondary small" style={{ whiteSpace: "pre-wrap" }}>
          {goal.notes}
        </p>
      )}
      <div>
        <button className="btn small danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </article>
  );
}
