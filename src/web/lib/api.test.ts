import { describe, expect, it } from "vitest";
import { ApiError, isUnauthorized, withTimezone } from "./api";

describe("isUnauthorized", () => {
  it("is true only for a 401, so an outage never looks like a sign-out", () => {
    expect(isUnauthorized(new ApiError(401, "unauthorized", "Sign in"))).toBe(true);
    expect(isUnauthorized(new ApiError(500, "internal", "Boom"))).toBe(false);
    expect(isUnauthorized(new TypeError("Failed to fetch"))).toBe(false);
  });
});

describe("withTimezone", () => {
  it("adds the offset to a JSON body", () => {
    expect(withTimezone({ question: "q" }, 120)).toEqual({ question: "q", tz: 120 });
  });

  it("keeps the files of a form body, which spreading into an object would drop", () => {
    const form = new FormData();
    form.append("files", new File(["a"], "Shares.csv"));
    const sent = withTimezone(form, 60);
    expect(sent).toBeInstanceOf(FormData);
    expect((sent as FormData).getAll("files")).toHaveLength(1);
    expect((sent as FormData).get("tz")).toBe("60");
  });
});
