import { describe, expect, it } from "vitest";
import { linkedInUrl } from "./links";

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
