import { describe, expect, it, vi } from "vitest";
import { NOT_AVAILABLE, formatChange, formatNumber, formatPercent } from "./format";

describe("formatting", () => {
  it("shows unknown values as not available, never as zero", () => {
    expect(formatNumber(null)).toBe(NOT_AVAILABLE);
    expect(formatPercent(undefined)).toBe(NOT_AVAILABLE);
    expect(formatNumber(0)).toBe("0");
  });

  it("shows no change at all when there is no honest percentage", () => {
    expect(formatChange(null)).toBeNull();
    expect(formatChange(0.124)).toBe("+12%");
    expect(formatChange(-0.5)).toBe("-50%");
  });

  it("keeps the calendar day of a date-only value west of UTC", async () => {
    // Formatters are built at import, so the timezone must be set before a fresh import.
    process.env.TZ = "America/Los_Angeles";
    vi.resetModules();
    const fresh = await import("./format");
    // Locale-neutral: the day must be 1 (en-GB "1 Mar 2026", en-US "Mar 1, 2026"), never 28.
    expect(fresh.formatDate("2026-03-01")).toMatch(/(^|\D)1(\D|$)/);
    expect(fresh.formatDate("2026-03-01")).not.toMatch(/28/);
  });
});
