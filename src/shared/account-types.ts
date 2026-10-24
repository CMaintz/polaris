import type { KpiDto } from "./analytics-types";
import type { PlanItemDto } from "./planning-types";

export type PlatformDto = "linkedin" | "other";

export interface AccountSummaryDto {
  id: string;
  platform: PlatformDto;
  label: string;
  displayName: string | null;
  active: boolean;
}

/** GET /accounts. */
export interface AccountListDto {
  accounts: AccountSummaryDto[];
}

/** GET /analytics/compare: one row per account, every row over the same period. */
export interface ComparisonDto {
  asOf: string;
  periodDays: number;
  rows: { account: AccountSummaryDto; latestData: string | null; kpis: KpiDto[] }[];
}

/** GET /plan/all: read-only, every account's plan items, by planned date. */
export interface AllPlanItemDto extends PlanItemDto {
  account: { id: string; label: string; platform: PlatformDto };
}
