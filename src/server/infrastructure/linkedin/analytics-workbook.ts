import { type ImportBundle, emptyBundle } from "../../domain/content";
import { normaliseHeader } from "../csv/csv";
import { type Cell, cellText, parseDayCell } from "../csv/values";
import { mergeDays, readEngagementDays, readFollowerDays } from "./account-day-sheets";
import { readDemographics } from "./demographics-sheet";
import { placeholderPost, readTopPosts } from "./top-posts-sheet";
import type { Period } from "./workbook-tables";

export const ANALYTICS_EXPORT_PROVIDER = "linkedin-analytics-export";

export interface Sheet {
  sheet: string;
  data: Cell[][];
}

const PERIOD = /(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{4})/;
const KNOWN_SHEETS = ["engagement", "followers", "topposts", "demographics", "discovery"];

/**
 * Parses LinkedIn's creator analytics export. The layout is undocumented (ADR 0010), so
 * every table is located by its header row rather than by fixed cell positions.
 */
export function parseAnalyticsWorkbook(sheets: Sheet[], importedOn: string): ImportBundle {
  const bundle = emptyBundle(ANALYTICS_EXPORT_PROVIDER);
  const period = findPeriod(sheets);
  const observedOn = period?.to ?? importedOn;
  const byName = new Map(sheets.map((s) => [normaliseHeader(s.sheet), s.data]));
  const engagement = byName.get("engagement");
  const followers = byName.get("followers");
  const topPosts = byName.get("topposts");
  const demographics = byName.get("demographics");
  if (engagement) mergeDays(bundle.accountDays, readEngagementDays(engagement));
  if (followers) mergeDays(bundle.accountDays, readFollowerDays(followers));
  if (topPosts) bundle.postMetrics.push(...readTopPosts(topPosts, observedOn, period));
  if (demographics) bundle.audience = { observedOn, segments: readDemographics(demographics) };
  bundle.posts = bundle.postMetrics.map((m) => placeholderPost(m.externalId, topPosts ?? []));
  bundle.warnings.push(...unknownSheetWarnings(sheets));
  return bundle;
}

function findPeriod(sheets: Sheet[]): Period | null {
  for (const cell of sheets.flatMap((s) => s.data.flat())) {
    const match = PERIOD.exec(cellText(cell));
    const from = parseDayCell(match?.[1]);
    const to = parseDayCell(match?.[2]);
    if (from && to) return { from, to };
  }
  return null;
}

function unknownSheetWarnings(sheets: Sheet[]): string[] {
  return sheets
    .filter((sheet) => !KNOWN_SHEETS.includes(normaliseHeader(sheet.sheet)))
    .map((sheet) => `Sheet "${sheet.sheet}" is not recognised and was skipped`);
}
