interface AccountDto {
  id: string;
  userId: string;
  platform: "linkedin" | "other";
  label: string;
  displayName: string | null;
  headline: string | null;
  profileUrl: string | null;
}

/** GET /imports/status. */
export interface ImportStatusDto {
  /** The active account, which imports go into. */
  account: AccountDto | null;
  /** Real (non-demo) data; the name predates other platforms (ADR 0026). */
  hasLinkedInData: boolean;
  hasDemoData: boolean;
  /** The file kinds that fit the active account's platform. */
  accepts: { provider: string; label: string; files: string }[];
}

/** One file of a finished import job; `JobDto.result` is `{ files: ImportFileReportDto[] }`. */
export interface ImportFileReportDto {
  file: string;
  provider: string;
  postsCreated: number;
  postsUpdated: number;
  metricSnapshots: number;
  accountDays: number;
  audienceSegments: number;
  warnings: string[];
}
