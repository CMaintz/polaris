import { describe, expect, it } from "vitest";
import { ANALYTICS_SHEETS, POST_1, POST_2, POST_3 } from "../../testing/linkedin-fixtures";
import { buildXlsx } from "../../testing/xlsx";
import { LinkedInAnalyticsExportProvider } from "./analytics-export-provider";
import { parseAnalyticsWorkbook } from "./analytics-workbook";

const context = { importedOn: "2026-03-10" };

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
