import { formatDay } from "../../domain/dates";

export type Cell = string | number | boolean | Date | null | undefined;

const URN = /urn:li:(activity|share|ugcPost):(\d+)/i;

/**
 * Stable post identity from a LinkedIn URL. LinkedIn URL-encodes the URN in some exports
 * and not in others, so both forms must yield the same id or re-imports would duplicate.
 */
export function externalIdFromUrl(url: string | null): string | null {
  if (!url) return null;
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    // Malformed escapes: match against the raw URL instead.
  }
  const match = URN.exec(decoded);
  if (match) return `urn:li:${match[1]}:${match[2]}`;
  return canonicalUrl(decoded);
}

function canonicalUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`.replace(/\/+$/, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Accepts Excel dates, M/D/YYYY, YYYY-MM-DD and "YYYY-MM-DD HH:MM:SS" (treated as UTC). */
export function parseTimestamp(value: Cell): { iso: string; timeKnown: boolean } | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : { iso: value.toISOString(), timeKnown: false };
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (us) return dayOnly(`${us[3]}-${pad(us[1])}-${pad(us[2])}`);
  const iso = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?/.exec(text);
  if (!iso) return null;
  if (!iso[2]) return dayOnly(iso[1] ?? "");
  const date = new Date(`${iso[1]}T${iso[2]}Z`);
  return Number.isNaN(date.getTime()) ? null : { iso: date.toISOString(), timeKnown: true };
}

export function parseDayCell(value: Cell): string | null {
  const parsed = parseTimestamp(value);
  return parsed ? formatDay(new Date(parsed.iso)) : null;
}

function dayOnly(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : { iso: date.toISOString(), timeKnown: false };
}

function pad(part: string | undefined): string {
  return (part ?? "").padStart(2, "0");
}

/** A number, or null for blanks and text. "1,234" and "12%" are understood. */
export function parseNumber(value: Cell): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/,/g, "");
  if (text === "") return null;
  const percent = text.endsWith("%");
  const number = Number(percent ? text.slice(0, -1) : text);
  if (!Number.isFinite(number)) return null;
  return percent ? number / 100 : number;
}

export function cellText(value: Cell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}
