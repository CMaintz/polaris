import type { ExperimentDto } from "../../shared/planning-types";
import { useResource } from "../lib/hooks/resource";
import { Empty, PageHead } from "../components/common/layout";
import { ResourceView } from "../components/common/resource-view";
import { ExperimentCard } from "../components/strategy/experiment-card";
import { ExperimentForm } from "../components/strategy/experiment-form";

export function ExperimentsPage() {
  const list = useResource<{ items: ExperimentDto[] }>("/experiments");
  return (
    <div className="stack">
      <PageHead
        title="Experiments"
        intro="Try one change and compare your posts during the experiment with the period before. This is a rule of thumb, not a statistical test."
      />
      <ExperimentForm onCreated={list.reload} />
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
