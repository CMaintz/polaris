import { AiKeys } from "../components/settings/ai-keys";
import { DataControls } from "../components/settings/data-controls";
import { Imports } from "../components/settings/imports";
import { PageHead } from "../components/ui";

export function SettingsPage() {
  return (
    <div className="stack">
      <PageHead title="Settings" intro="Your data sources, AI keys and data controls." />
      <Imports />
      <AiKeys />
      <DataControls />
    </div>
  );
}
