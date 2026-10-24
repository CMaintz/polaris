import { describe, expect, it } from "vitest";
import { withParam } from "./filters";

describe("withParam", () => {
  it("keeps the page offset when paging", () => {
    expect(withParam(new URLSearchParams("q=ai"), "offset", "25").toString()).toBe(
      "q=ai&offset=25",
    );
  });

  it("returns to the first page when a filter changes", () => {
    const next = withParam(new URLSearchParams("q=ai&offset=25"), "type", "video");
    expect(next.get("offset")).toBeNull();
    expect(next.get("type")).toBe("video");
  });

  it("drops a cleared filter instead of sending it empty", () => {
    expect(withParam(new URLSearchParams("q=ai"), "q", "").has("q")).toBe(false);
  });
});
