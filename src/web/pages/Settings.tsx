import { Accounts } from "../components/settings/accounts";
import { AiKeys } from "../components/settings/ai-keys";
import { DataControls } from "../components/settings/data-controls";
import { Imports } from "../components/settings/imports";
import { Connections } from "../components/action/connections";
import { PageHead } from "../components/common/layout";
import { SchedulesSection } from "../components/intelligence/schedules";

export function SettingsPage() {
  return (
    <div className="stack">
      <PageHead
        title="Settings"
        intro="Your accounts, data sources, AI keys, publishing connections, schedules and data controls."
      />
      <Accounts />
      <Imports />
      <AiKeys />
      <Connections />
      <SchedulesSection />
      <DataControls />
    </div>
  );
}
