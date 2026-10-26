import { addDays, parseDay } from "../../domain/dates";

// Rest.li 2.0 query syntax: parentheses, colons and commas are structure and must stay raw,
// while a URN inside is percent-encoded. URLSearchParams would encode the structure too.

const API_POST = /^urn:li:(share|ugcPost):\d+$/;
/** The finder's key for each URN type; ugcPost URNs go under "ugc". */
const ENTITY_KEY: Record<string, string> = { share: "share", ugcPost: "ugc" };

/** Only share and ugcPost URNs are accepted; imported posts mostly carry activity URNs. */
export const isApiPost = (externalId: string): boolean => API_POST.test(externalId);

export function entityParam(urn: string): string {
  const type = API_POST.exec(urn)?.[1];
  if (!type) throw new RangeError(`Not a share or ugcPost URN: ${urn}`);
  return `(${ENTITY_KEY[type]}:${encodeURIComponent(urn)})`;
}

function dateParam(day: string): string {
  const date = parseDay(day);
  return `(day:${date.getUTCDate()},month:${date.getUTCMonth() + 1},year:${date.getUTCFullYear()})`;
}

/** `from` is included and `until` excluded, as LinkedIn's dateRange is. */
export const dateRangeParam = (from: string, until: string): string =>
  `(start:${dateParam(from)},end:${dateParam(until)})`;

export function queryString(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

/** Consecutive windows of at most `size` days covering [from, until). */
export function windows(from: string, until: string, size: number) {
  const result: { from: string; until: string }[] = [];
  for (let start = from; start < until; start = addDays(start, size)) {
    const end = addDays(start, size);
    result.push({ from: start, until: end < until ? end : until });
  }
  return result;
}
