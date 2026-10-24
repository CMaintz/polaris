import { useState } from "react";
import { Link } from "react-router-dom";
import type { PillarReportDto } from "../../shared/strategy-types";
import { PageHead } from "../components/common/layout";
import { PillarReport } from "../components/strategy/pillar-report";
import { PillarsSection } from "../components/strategy/pillars";
import { useResource } from "../lib/hooks/resource";

export function StrategyPage() {
  const [days, setDays] = useState(90);
  const report = useResource<PillarReportDto>(`/strategy/pillars/report?days=${days}`);
  return (
    <div className="stack">
      <PageHead
        title="Strategy"
        intro="Your content pillars and how your posting mix compares with the plan."
        actions={
          <>
            <Link className="btn" to="/campaigns">
              Campaigns
            </Link>
            <Link className="btn" to="/funnel">
              Funnel
            </Link>
          </>
        }
      />
      <PillarsSection onChange={report.reload} />
      <PillarReport report={report} days={days} onDays={setDays} />
    </div>
  );
}
