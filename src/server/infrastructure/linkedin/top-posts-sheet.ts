import type { ImportedPost, ImportedPostMetrics } from "../../domain/content";
import { EMPTY_METRICS } from "../../domain/metrics";
import { type Cell, cellText, parseDayCell, parseNumber } from "../csv/values";
import { externalIdFromUrl } from "./values";
import { type HeaderRow, type Period, column, findHeader } from "./workbook-tables";

interface TableTarget {
  observedOn: string;
  period: Period | null;
  into: Map<string, ImportedPostMetrics>;
}

export function readTopPosts(rows: Cell[][], observedOn: string, period: Period | null) {
  const header = findHeader(rows, ["Post URL"]);
  if (!header) return [];
  const target: TableTarget = { observedOn, period, into: new Map() };
  for (let start = column(header.headers, "Post URL"); start >= 0;) {
    readTopPostsTable(rows, header, start, target);
    start = column(header.headers, "Post URL", start + 1);
  }
  return [...target.into.values()];
}

/** One of the side-by-side tables (ranked by engagements, or by impressions). */
function readTopPostsTable(
  rows: Cell[][],
  header: HeaderRow,
  urlColumn: number,
  target: TableTarget,
): void {
  const metric = rankedMetric(header.headers, urlColumn);
  if (!metric) return;
  for (const row of rows.slice(header.index + 1)) {
    const externalId = externalIdFromUrl(cellText(row[urlColumn]) || null);
    const value = parseNumber(row[metric.column]);
    if (externalId && value !== null) addMetric(target, externalId, metric.name, value);
  }
}

function rankedMetric(headers: string[], urlColumn: number) {
  const next = column(headers, "Post URL", urlColumn + 1);
  const span = headers.slice(urlColumn, next < 0 ? undefined : next);
  const name = span.find((h) => h === "engagements" || h === "impressions");
  return name ? { name, column: urlColumn + span.indexOf(name) } : null;
}

function addMetric(target: TableTarget, externalId: string, name: string, value: number) {
  const { observedOn, period, into } = target;
  const entry = into.get(externalId) ?? {
    externalId,
    observedOn,
    metrics: { ...EMPTY_METRICS },
    period,
  };
  entry.metrics = { ...entry.metrics, [name]: value };
  into.set(externalId, entry);
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

export function placeholderPost(externalId: string, rows: Cell[][]): ImportedPost {
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
