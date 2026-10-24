import type { ProposalDto } from "../../shared/action-types";
import { useResource } from "../lib/hooks/resource";
import { PlanRequest } from "../components/action/plan-request";
import { ProposalLists } from "../components/action/proposal-lists";
import { PageHead } from "../components/common/layout";
import { ResourceView } from "../components/common/resource-view";

export function ApprovalsPage() {
  const list = useResource<{ proposals: ProposalDto[] }>("/action/proposals");
  return (
    <div className="stack">
      <PageHead
        title="Approvals"
        intro="Changes the AI suggests wait here. Nothing is added to your plan until you approve it."
      />
      <PlanRequest onDone={list.reload} />
      <ResourceView resource={list}>
        {({ proposals }) => <ProposalLists proposals={proposals} onChange={list.reload} />}
      </ResourceView>
    </div>
  );
}
