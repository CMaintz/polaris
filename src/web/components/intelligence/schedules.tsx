import type { PeerDto, ScheduleDto } from "../../../shared/intelligence-types";
import { useResource } from "../../lib/hooks/resource";
import { ResourceView } from "../common/resource-view";
import { NewSchedule } from "./schedule-form";
import { ScheduleTable } from "./schedule-table";

export function SchedulesSection() {
  const schedules = useResource<{ items: ScheduleDto[] }>("/intelligence/schedules");
  const peers = useResource<{ items: PeerDto[] }>("/intelligence/peers");
  return (
    <section className="card stack">
      <h2>Schedules</h2>
      <p className="small secondary">
        Scheduled AI work uses your own API key and is billed by your provider each time it runs.
      </p>
      <NewSchedule peers={peers.data?.items ?? []} onDone={schedules.reload} />
      <ResourceView resource={schedules}>
        {(data) =>
          data.items.length === 0 ? (
            <p className="muted">
              Nothing is scheduled. Add a schedule above to run it automatically.
            </p>
          ) : (
            <ScheduleTable items={data.items} onChange={schedules.reload} />
          )
        }
      </ResourceView>
    </section>
  );
}
