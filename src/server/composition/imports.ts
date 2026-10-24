import { ImportService } from "../application/imports/import-service";
import { SqliteImportFileStore } from "../infrastructure/db/import-file-store";
import { buildDemoBundle } from "../infrastructure/demo/demo-provider";
import { LinkedInAnalyticsExportProvider } from "../infrastructure/linkedin/analytics-export-provider";
import { LinkedInDataExportProvider } from "../infrastructure/linkedin/data-export-provider";
import { GenericPostsCsvProvider } from "../infrastructure/csv/generic-posts-provider";
import type { Core } from "./core";

export function buildImports({ db, content, accountStore, jobs, audit, clock }: Core) {
  return new ImportService({
    // Order matters: the generic CSV reads any .csv, so the LinkedIn adapters claim theirs first.
    providers: [
      new LinkedInDataExportProvider(),
      new LinkedInAnalyticsExportProvider(),
      new GenericPostsCsvProvider(),
    ],
    demo: (today) => buildDemoBundle(today),
    files: new SqliteImportFileStore(db),
    content,
    accounts: accountStore,
    jobs,
    audit,
    clock,
  });
}
