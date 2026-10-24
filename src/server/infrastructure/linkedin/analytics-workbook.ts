import {
  type ImportBundle,
  type ImportedAccountDay,
  type ImportedPostMetrics,
  emptyBundle,
} from "../../domain/content";
import { EMPTY_METRICS } from "../../domain/metrics";
import { normaliseHeader } from "../csv/csv";
import { type Cell, cellText, parseDayCell, parseNumber } from "../csv/values";
import { externalIdFromUrl } from "./values";

export const ANALYTICS_EXPORT_PROVIDER = "linkedin-analytics-export";

export interface Sheet {
  sheet: string;
  data: Cell[][];
}

interface Period {
  from: string;
  to: string;
}

const PERIOD = /(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{4})/;
const TOTAL_FOLLOWERS = /total followers on (\d{1,2}\/\d{1,2}\/\d{4})/i;

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
  const known = ["engagement", "followers", "topposts", "demographics", "discovery"];
  for (const sheet of sheets) {
    if (!known.includes(normaliseHeader(sheet.sheet))) {
      bundle.warnings.push(`Sheet "${sheet.sheet}" is not recognised and was skipped`);
    }
  }
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

function findHeader(rows: Cell[][], required: string[]) {
  const wanted = required.map(normaliseHeader);
  for (let index = 0; index < rows.length; index += 1) {
    const headers = (rows[index] ?? []).map((cell) => normaliseHeader(cellText(cell)));
    if (wanted.every((h) => headers.includes(h))) return { index, headers };
  }
  return null;
}

function column(headers: string[], name: string, from = 0): number {
  return headers.indexOf(normaliseHeader(name), from);
}

function readEngagementDays(rows: Cell[][]): ImportedAccountDay[] {
  const header = findHeader(rows, ["Date", "Impressions"]);
  if (!header) return [];
  const [date, impressions, engagements] = ["Date", "Impressions", "Engagements"].map((h) =>
    column(header.headers, h),
  );
  return rows.slice(header.index + 1).flatMap((row) => {
    const day = parseDayCell(row[date ?? -1]);
    if (!day) return [];
    return [
      {
        ...emptyDay(day),
        impressions: parseNumber(row[impressions ?? -1]),
        engagements: (engagements ?? -1) >= 0 ? parseNumber(row[engagements ?? -1]) : null,
      },
    ];
  });
}

/**
 * Daily new followers, plus follower totals back-calculated from the one stated total:
 * the total at the end of day D is the stated total minus the new followers gained after D.
 */
function readFollowerDays(rows: Cell[][]): ImportedAccountDay[] {
  const header = findHeader(rows, ["Date", "New followers"]);
  if (!header) return [];
  const [date, gained] = ["Date", "New followers"].map((h) => column(header.headers, h));
  const days = rows.slice(header.index + 1).flatMap((row) => {
    const day = parseDayCell(row[date ?? -1]);
    return day ? [{ ...emptyDay(day), newFollowers: parseNumber(row[gained ?? -1]) }] : [];
  });
  const total = findTotalFollowers(rows);
  return total ? backfillFollowers(days, total) : days;
}

function findTotalFollowers(rows: Cell[][]): { day: string; followers: number } | null {
  for (const row of rows) {
    for (let i = 0; i < row.length; i += 1) {
      const match = TOTAL_FOLLOWERS.exec(cellText(row[i]));
      const day = parseDayCell(match?.[1]);
      const followers = parseNumber(row[i + 1] ?? null);
      if (day && followers !== null) return { day, followers };
    }
  }
  return null;
}

function backfillFollowers(
  days: ImportedAccountDay[],
  total: { day: string; followers: number },
): ImportedAccountDay[] {
  const sorted = [...days].sort((a, b) => b.day.localeCompare(a.day));
  let running = total.followers;
  let gapFree = true;
  const result = sorted.map((day) => {
    if (day.day > total.day) return day;
    const known = gapFree ? running : null;
    // A missing count makes every earlier total unknowable, not zero.
    if (day.newFollowers === null) gapFree = false;
    else running -= day.newFollowers;
    return { ...day, followers: known };
  });
  if (!days.some((d) => d.day === total.day)) {
    result.push({ ...emptyDay(total.day), followers: total.followers });
  }
  return result;
}

function readTopPosts(rows: Cell[][], observedOn: string, period: Period | null) {
  const header = findHeader(rows, ["Post URL"]);
  if (!header) return [];
  const metrics = new Map<string, ImportedPostMetrics>();
  let start = column(header.headers, "Post URL");
  while (start >= 0) {
    readTopPostsTable(rows, header, start, observedOn, period, metrics);
    start = column(header.headers, "Post URL", start + 1);
  }
  return [...metrics.values()];
}

/** One of the side-by-side tables (ranked by engagements, or by impressions). */
function readTopPostsTable(
  rows: Cell[][],
  header: { index: number; headers: string[] },
  urlColumn: number,
  observedOn: string,
  period: Period | null,
  into: Map<string, ImportedPostMetrics>,
): void {
  const next = column(header.headers, "Post URL", urlColumn + 1);
  const span = header.headers.slice(urlColumn, next < 0 ? undefined : next);
  const metricName = span.find((h) => h === "engagements" || h === "impressions");
  if (!metricName) return;
  const metricColumn = urlColumn + span.indexOf(metricName);
  for (const row of rows.slice(header.index + 1)) {
    const externalId = externalIdFromUrl(cellText(row[urlColumn]) || null);
    const value = parseNumber(row[metricColumn]);
    if (!externalId || value === null) continue;
    const entry = into.get(externalId) ?? {
      externalId,
      observedOn,
      metrics: { ...EMPTY_METRICS },
      period,
    };
    entry.metrics = { ...entry.metrics, [metricName]: value };
    into.set(externalId, entry);
  }
}

function findPostRow(
  externalId: string,
  rows: Cell[][],
): { url: string; day: string | null } | null {
  const header = findHeader(rows, ["Post URL", "Post publish date"]);
  if (!header) return null;
  for (let url = column(header.headers, "Post URL"); url >= 0;) {
    const date = column(header.headers, "Post publish date", url);
    const row = rows.find((r) => externalIdFromUrl(cellText(r[url]) || null) === externalId);
    if (row) return { url: cellText(row[url]), day: parseDayCell(row[date]) };
    url = column(header.headers, "Post URL", url + 1);
  }
  return null;
}

function placeholderPost(externalId: string, rows: Cell[][]) {
  const found = findPostRow(externalId, rows);
  const day = found?.day ?? null;
  return {
    externalId,
    url: found?.url ?? null,
    text: null,
    publishedAt: day ? `${day}T00:00:00.000Z` : null,
    timeKnown: false,
    contentType: "unknown" as const,
    sourceMetadata: {},
  };
}

function readDemographics(rows: Cell[][]) {
  const header = findHeader(rows, ["Top Demographics", "Value", "Percentage"]);
  if (!header) return [];
  const [dimension, value, share] = ["Top Demographics", "Value", "Percentage"].map((h) =>
    column(header.headers, h),
  );
  return rows.slice(header.index + 1).flatMap((row) => {
    const dim = cellText(row[dimension ?? -1]);
    const val = cellText(row[value ?? -1]);
    if (!dim || !val) return [];
    return [{ dimension: dim, value: val, share: toShare(row[share ?? -1]) }];
  });
}

/** LinkedIn writes shares as 0.12, "12%" or "< 1%"; Polaris stores fractions. */
function toShare(cell: Cell): number | null {
  const text = cellText(cell).replace(/^<\s*/, "");
  const number = parseNumber(text);
  if (number === null) return null;
  return number > 1 ? number / 100 : number;
}

function emptyDay(day: string): ImportedAccountDay {
  return { day, followers: null, newFollowers: null, impressions: null, engagements: null };
}

/** A value one sheet lacks never blanks the value another sheet gave for that day. */
function mergeDays(into: ImportedAccountDay[], days: ImportedAccountDay[]): void {
  for (const day of days) {
    const existing = into.find((d) => d.day === day.day);
    if (!existing) into.push(day);
    else
      for (const key of ["followers", "newFollowers", "impressions", "engagements"] as const) {
        existing[key] = day[key] ?? existing[key];
      }
  }
}
