// Calendar days are "YYYY-MM-DD" strings in UTC. Keeping them as strings (not Date) makes
// them safe SQLite keys and immune to the local timezone of the machine running Polaris.

const DAY_MS = 86_400_000;

export function parseDay(day: string): Date {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid day: ${day}`);
  return date;
}

export function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  return formatDay(new Date(parseDay(day).getTime() + days * DAY_MS));
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / DAY_MS);
}

export function dayOf(isoTimestamp: string): string {
  return formatDay(new Date(isoTimestamp));
}

export function todayUtc(now: Date = new Date()): string {
  return formatDay(now);
}

/** Monday of the ISO week containing `day`. */
export function weekStart(day: string): string {
  const date = parseDay(day);
  const offset = (date.getUTCDay() + 6) % 7;
  return addDays(day, -offset);
}

export function isWithin(day: string, from: string, to: string): boolean {
  return day >= from && day <= to;
}
