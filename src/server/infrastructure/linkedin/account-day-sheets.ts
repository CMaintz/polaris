import type { ImportedAccountDay } from "../../domain/content";
import { type Cell, cellText, parseDayCell, parseNumber } from "../csv/values";
import { column, findHeader } from "./workbook-tables";

const TOTAL_FOLLOWERS = /total followers on (\d{1,2}\/\d{1,2}\/\d{4})/i;

export function readEngagementDays(rows: Cell[][]): ImportedAccountDay[] {
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
export function readFollowerDays(rows: Cell[][]): ImportedAccountDay[] {
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

export function backfillFollowers(
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

export function emptyDay(day: string): ImportedAccountDay {
  return { day, followers: null, newFollowers: null, impressions: null, engagements: null };
}

/** A value one sheet lacks never blanks the value another sheet gave for that day. */
export function mergeDays(into: ImportedAccountDay[], days: ImportedAccountDay[]): void {
  for (const day of days) {
    const existing = into.find((d) => d.day === day.day);
    if (!existing) into.push(day);
    else
      for (const key of ["followers", "newFollowers", "impressions", "engagements"] as const) {
        existing[key] = day[key] ?? existing[key];
      }
  }
}
