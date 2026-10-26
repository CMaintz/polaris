import readXlsxFile from "read-excel-file/node";
import { PermanentJobError } from "../../application/errors";
import type { ReadContext, SocialDataProvider, SourceFile } from "../../application/imports/ports";
import type { ImportBundle } from "../../domain/content";
import {
  ANALYTICS_EXPORT_PROVIDER,
  type Sheet,
  parseAnalyticsWorkbook,
} from "./analytics-workbook";

/** LinkedIn's creator analytics export (Analytics > Export), an .xlsx workbook. */
export class LinkedInAnalyticsExportProvider implements SocialDataProvider {
  readonly id = ANALYTICS_EXPORT_PROVIDER;
  readonly label = "LinkedIn analytics export";

  canRead(file: SourceFile): boolean {
    return file.name.toLowerCase().endsWith(".xlsx");
  }

  async read(file: SourceFile, context: ReadContext): Promise<ImportBundle[]> {
    let sheets: Sheet[];
    try {
      sheets = (await readXlsxFile(Buffer.from(file.bytes))) as Sheet[];
    } catch {
      throw new PermanentJobError(`${file.name} is not a readable Excel workbook`);
    }
    const bundle = parseAnalyticsWorkbook(sheets, context.importedOn);
    const empty =
      bundle.postMetrics.length === 0 && bundle.accountDays.length === 0 && !bundle.audience;
    if (empty) {
      throw new PermanentJobError(
        `${file.name} has none of the expected LinkedIn analytics sheets (ENGAGEMENT, FOLLOWERS, TOP POSTS, DEMOGRAPHICS)`,
      );
    }
    return [bundle];
  }
}
