import { describe, expect, it } from "vitest";
import { linkedInUrl, safeHref } from "./links";

describe("linkedInUrl", () => {
  it("allows https links on linkedin.com", () => {
    const url = "https://www.linkedin.com/feed/update/urn:li:activity:1/";
    expect(linkedInUrl(url)).toBe(url);
  });

  it("rejects script URLs and other hosts that an imported file could contain", () => {
    expect(linkedInUrl("javascript:alert(1)//urn:li:activity:1")).toBeNull();
    expect(linkedInUrl("https://linkedin.com.evil.example/urn:li:activity:1")).toBeNull();
    expect(linkedInUrl("http://www.linkedin.com/feed/update/x")).toBeNull();
    expect(linkedInUrl(null)).toBeNull();
  });
});
describe("safeHref", () => {
  it("links only http(s) URLs from model output", () => {
    expect(safeHref("https://news.example/a")).toBe("https://news.example/a");
    expect(safeHref("http://news.example/a")).toBe("http://news.example/a");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("JaVaScRiPt:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeHref("/relative/path")).toBeNull();
    expect(safeHref(null)).toBeNull();
  });
});
