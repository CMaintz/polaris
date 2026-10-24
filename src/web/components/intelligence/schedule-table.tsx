import type { ScheduleDto } from "../../../shared/intelligence-types";
import { del, patch } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { useMutation } from "../../lib/hooks/mutation";
import { ErrorBox } from "../common/feedback";
import { SCHEDULE_KINDS } from "./schedule-kinds";

export function ScheduleTable({ items, onChange }: { items: ScheduleDto[]; onChange: () => void }) {
  const toggle = useMutation(
    (s: ScheduleDto) => patch(`/intelligence/schedules/${s.id}`, { enabled: !s.enabled }),
    onChange,
  );
  const remove = useMutation((s: ScheduleDto) => del(`/intelligence/schedules/${s.id}`), onChange);
  return (
    <div className="table-wrap">
      <ErrorBox error={toggle.error ?? remove.error} />
      <table>
        <thead>
          <tr>
            <th>What</th>
            <th>How often</th>
            <th>Last run</th>
            <th>Next run</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.id}>
              <td>
                {SCHEDULE_KINDS[s.kind]}
                {s.params.question && <div className="small muted">{s.params.question}</div>}
              </td>
              <td>{s.cadence === "daily" ? "Daily" : "Weekly"}</td>
              <td>{s.lastRunAt ? formatDate(s.lastRunAt) : "Never"}</td>
              <td>{s.enabled ? formatDate(s.nextRunAt) : "Paused"}</td>
              <td className="row">
                <button className="btn small" disabled={toggle.busy} onClick={() => toggle.run(s)}>
                  {s.enabled ? "Pause" : "Resume"}
                </button>
                <button
                  className="btn small danger"
                  disabled={remove.busy}
                  onClick={() => remove.run(s)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
