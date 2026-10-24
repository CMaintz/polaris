import { ImportService } from "../application/imports/import-service";
import { SqliteImportFileStore } from "../infrastructure/db/import-file-store";
import { buildDemoBundle } from "../infrastructure/demo/demo-provider";
import { LinkedInAnalyticsExportProvider } from "../infrastructure/linkedin/analytics-export-provider";
import { LinkedInDataExportProvider } from "../infrastructure/linkedin/data-export-provider";
import type { Core } from "./core";

export function buildImports({ db, content, jobs, audit, clock }: Core) {
  return new ImportService({
    providers: [new LinkedInDataExportProvider(), new LinkedInAnalyticsExportProvider()],
    demo: (today) => buildDemoBundle(today),
    files: new SqliteImportFileStore(db),
    content,
    jobs,
    audit,
    clock,
  });
}
