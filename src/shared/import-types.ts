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

/** How a file's rows compare with what the account already held. */
export interface ChangeCountsDto {
  added: number;
  changed: number;
  unchanged: number;
}

/** One file of a finished import job; `JobDto.result` is `{ files: ImportFileReportDto[] }`. */
export interface ImportFileReportDto {
  file: string;
  /** Null when the file was skipped unread. */
  provider: string | null;
  posts: ChangeCountsDto;
  metricSnapshots: ChangeCountsDto;
  accountDays: number;
  audienceSegments: number;
  warnings: string[];
  /** When identical bytes were first imported into the account; the file was then skipped. */
  alreadyImportedOn: string | null;
}
