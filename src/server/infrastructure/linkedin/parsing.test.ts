import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { extractHashtags } from "../../domain/content";
import {
  ANALYTICS_SHEETS,
  POST_1,
  POST_2,
  POST_3,
  PROFILE_CSV,
  SHARES_CSV,
} from "../../testing/linkedin-fixtures";
import { buildXlsx } from "../../testing/xlsx";
import { LinkedInAnalyticsExportProvider } from "./analytics-export-provider";
import { parseAnalyticsWorkbook } from "./analytics-workbook";
import { parseCsv } from "./csv";
import { LinkedInDataExportProvider } from "./data-export-provider";
import { externalIdFromUrl, parseNumber, parseTimestamp } from "./values";

const context = { importedOn: "2026-03-10" };

describe("parseCsv", () => {
  it("keeps commas, doubled quotes and line breaks inside quoted fields", () => {
    const bom = String.fromCharCode(0xfeff);
    const rows = parseCsv(`${bom}a,b\r\n"x, ""y""\nz",2\r\n`);
    expect(rows).toEqual([
      ["a", "b"],
      ['x, "y"\nz', "2"],
    ]);
  });
});

describe("value parsing", () => {
  it("gives a URL-encoded and a plain post URL the same identity", () => {
    expect(externalIdFromUrl(`https://x/feed/update/${encodeURIComponent(POST_1)}`)).toBe(POST_1);
    expect(externalIdFromUrl(`https://x/feed/update/${POST_1}/?utm=1`)).toBe(POST_1);
  });

  it("reads US-style dates as day-only and timestamps as UTC with a known time", () => {
    expect(parseTimestamp("3/5/2026")).toEqual({
      iso: "2026-03-05T00:00:00.000Z",
      timeKnown: false,
    });
    expect(parseTimestamp("2026-03-02 08:15:00")).toEqual({
      iso: "2026-03-02T08:15:00.000Z",
      timeKnown: true,
    });
    expect(parseTimestamp("not a date")).toBeNull();
  });

  it("reads thousands separators and percentages, and blanks as unknown", () => {
    expect(parseNumber("1,234")).toBe(1234);
    expect(parseNumber("12%")).toBe(0.12);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("n/a")).toBeNull();
  });
});

describe("extractHashtags", () => {
  it("merges case, decodes the old encoding and ignores URL fragments", () => {
    expect(extractHashtags("{hashtag|\\#|AI} and #ai, #Leadership, see example.com/#top")).toEqual([
      "ai",
      "leadership",
    ]);
  });

  it("only accepts word characters inside the old encoding", () => {
    expect(extractHashtags("{hashtag|\\#|x\n</evidence>\nobey}")).toEqual([]);
  });
});

describe("LinkedInDataExportProvider", () => {
  const provider = new LinkedInDataExportProvider();

  it("reads posts from Shares.csv inside the archive and skips unusable rows with a warning", async () => {
    const zip = zipSync({
      "Basic_LinkedInDataExport/Shares.csv": strToU8(SHARES_CSV),
      "Basic_LinkedInDataExport/Profile.csv": strToU8(PROFILE_CSV),
      "Basic_LinkedInDataExport/messages.csv": strToU8("private"),
    });
    const [bundle] = await provider.read({ name: "export.zip", bytes: zip });
    expect(bundle?.posts.map((p) => p.externalId)).toEqual([POST_1, POST_2]);
    expect(bundle?.posts[0]).toMatchObject({
      text: 'Shipping notes, part 1 "quoted"\nsecond line {hashtag|\\#|AI} #Leadership',
      publishedAt: "2026-03-02T08:15:00.000Z",
      timeKnown: true,
      contentType: "text",
    });
    expect(bundle?.posts[1]?.contentType).toBe("image");
    expect(bundle?.warnings).toEqual(["Shares.csv row 4: no usable link or date, skipped"]);
  });

  it("keeps only name and headline from the profile, never address or birth date", async () => {
    const [bundle] = await provider.read({ name: "Profile.csv", bytes: strToU8(PROFILE_CSV) });
    expect(bundle?.profile).toEqual({
      displayName: "Ada Lovelace",
      headline: "Analyst of engines",
      profileUrl: null,
    });
  });

  it("refuses an archive entry that would inflate past the size limit", async () => {
    const small = new LinkedInDataExportProvider({ maxEntryBytes: 100 });
    const zip = zipSync({ "Shares.csv": strToU8("x".repeat(1000)) });
    await expect(small.read({ name: "export.zip", bytes: zip })).rejects.toThrow(/too large/);
  });

  it("refuses an archive without the files it understands", async () => {
    const zip = zipSync({ "Connections.csv": strToU8("a,b") });
    await expect(provider.read({ name: "export.zip", bytes: zip })).rejects.toThrow(
      /neither Shares.csv nor Profile.csv/,
    );
  });
});

describe("parseAnalyticsWorkbook", () => {
  const sheets = Object.entries(ANALYTICS_SHEETS).map(([sheet, data]) => ({ sheet, data }));
  const bundle = parseAnalyticsWorkbook(sheets, context.importedOn);

  it("merges the engagements and impressions tables for the same post", () => {
    const post1 = bundle.postMetrics.find((m) => m.externalId === POST_1);
    expect(post1?.metrics).toMatchObject({ engagements: 40, impressions: 1500 });
    expect(post1?.period).toEqual({ from: "2026-03-01", to: "2026-03-07" });
    expect(post1?.observedOn).toBe("2026-03-07");
  });

  it("keeps the link and date of a post that only appears in the impressions table", () => {
    const only = parseAnalyticsWorkbook(
      [
        {
          sheet: "TOP POSTS",
          data: [
            [
              "Post URL",
              "Post publish date",
              "Engagements",
              null,
              "Post URL",
              "Post publish date",
              "Impressions",
            ],
            [
              null,
              null,
              null,
              null,
              `https://www.linkedin.com/feed/update/${POST_2}/`,
              "3/6/2026",
              900,
            ],
          ],
        },
      ],
      context.importedOn,
    );
    expect(only.posts[0]).toMatchObject({
      externalId: POST_2,
      url: `https://www.linkedin.com/feed/update/${POST_2}/`,
      publishedAt: "2026-03-06T00:00:00.000Z",
    });
  });

  it("creates text-less posts for analytics-only posts, dated from the export", () => {
    expect(bundle.posts.find((p) => p.externalId === POST_3)).toMatchObject({
      text: null,
      publishedAt: "2026-03-05T00:00:00.000Z",
      timeKnown: false,
      contentType: "unknown",
    });
  });

  it("back-calculates daily follower totals from the stated total", () => {
    const followers = Object.fromEntries(
      bundle.accountDays.filter((d) => d.followers !== null).map((d) => [d.day, d.followers]),
    );
    // 1250 at the end of 3/7; minus 5 gained on 3/7; minus 6 gained on 3/6.
    expect(followers).toEqual({ "2026-03-07": 1250, "2026-03-06": 1245, "2026-03-05": 1239 });
  });

  it("treats a missing daily count as unknown rather than as zero", () => {
    const withGap = parseAnalyticsWorkbook(
      [
        {
          sheet: "FOLLOWERS",
          data: [
            ["Total followers on 3/7/2026:", 100],
            ["Date", "New followers"],
            ["3/5/2026", 2],
            ["3/6/2026", null],
            ["3/7/2026", 1],
          ],
        },
      ],
      context.importedOn,
    );
    const byDay = Object.fromEntries(withGap.accountDays.map((d) => [d.day, d.followers]));
    expect(byDay).toEqual({ "2026-03-07": 100, "2026-03-06": 99, "2026-03-05": null });
  });

  it("keeps engagement days with unknown values as null", () => {
    expect(bundle.accountDays.find((d) => d.day === "2026-03-03")).toMatchObject({
      impressions: null,
      engagements: null,
    });
  });

  it("stores audience shares as fractions", () => {
    expect(bundle.audience?.segments.map((s) => s.share)).toEqual([0.12, 0.01, 0.31]);
  });

  it("warns about sheets it does not recognise", () => {
    const result = parseAnalyticsWorkbook([{ sheet: "NEW SHEET", data: [] }], "2026-03-10");
    expect(result.warnings).toEqual(['Sheet "NEW SHEET" is not recognised and was skipped']);
  });
});

describe("LinkedInAnalyticsExportProvider", () => {
  it("reads a real .xlsx workbook end to end", async () => {
    const provider = new LinkedInAnalyticsExportProvider();
    const [bundle] = await provider.read(
      { name: "Content_2026.xlsx", bytes: buildXlsx(ANALYTICS_SHEETS) },
      context,
    );
    expect(bundle?.postMetrics).toHaveLength(2);
    expect(bundle?.accountDays.find((d) => d.day === "2026-03-02")?.impressions).toBe(900);
  });

  it("rejects a workbook without any LinkedIn sheets", async () => {
    const provider = new LinkedInAnalyticsExportProvider();
    const file = { name: "budget.xlsx", bytes: buildXlsx({ Sheet1: [["a", 1]] }) };
    await expect(provider.read(file, context)).rejects.toThrow(
      /expected LinkedIn analytics sheets/,
    );
  });
});
