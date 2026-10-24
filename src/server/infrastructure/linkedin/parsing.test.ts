import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { extractHashtags } from "../../domain/content";
import { POST_1, POST_2, PROFILE_CSV, SHARES_CSV } from "../../testing/linkedin-fixtures";
import { csvRecords } from "../csv/csv";
import { LinkedInDataExportProvider } from "./data-export-provider";
import { parseNumber, parseTimestamp } from "../csv/values";
import { externalIdFromUrl } from "./values";

describe("csvRecords", () => {
  it("keeps commas, doubled quotes and line breaks inside quoted fields", () => {
    const bom = String.fromCharCode(0xfeff);
    const records = csvRecords(`${bom}a,b\r\n"x, ""y""\nz",2\r\n`);
    expect(records).toEqual([{ a: 'x, "y"\nz', b: "2" }]);
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
