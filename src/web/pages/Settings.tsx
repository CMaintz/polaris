import { AiKeys } from "../components/settings/ai-keys";
import { DataControls } from "../components/settings/data-controls";
import { Imports } from "../components/settings/imports";
import { Connections } from "../components/action";
import { SchedulesSection } from "../components/intelligence";
import { PageHead } from "../components/ui";

export function SettingsPage() {
  return (
    <div className="stack">
      <PageHead
        title="Settings"
        intro="Your data sources, AI keys, publishing connections, schedules and data controls."
      />
      <Imports />
      <AiKeys />
      <Connections />
      <SchedulesSection />
      <DataControls />
    </div>
  );
}
