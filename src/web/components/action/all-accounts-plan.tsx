import type { AllPlanItemDto } from "../../../shared/account-types";
import { PLATFORM_NAMES } from "../../lib/accounts";
import { formatDate } from "../../lib/format";
import { useResource } from "../../lib/hooks/resource";
import { DataTable } from "../common/data-table";
import { Empty } from "../common/layout";
import { ResourceView } from "../common/resource-view";

/** Read-only: editing happens in each account's own planner. */
export function AllAccountsPlan() {
  const list = useResource<{ items: AllPlanItemDto[] }>("/plan/all");
  return (
    <ResourceView resource={list}>
      {({ items }) =>
        items.length === 0 ? (
          <Empty title="Nothing planned in any account" />
        ) : (
          <DataTable
            headers={["Planned for", "Title", "Account", "Status"]}
            rows={items.map((item) => [
              item.plannedDate ? formatDate(item.plannedDate) : "No date",
              item.title,
              `${item.account.label} (${PLATFORM_NAMES[item.account.platform]})`,
              item.status,
            ])}
          />
        )
      }
    </ResourceView>
  );
}
