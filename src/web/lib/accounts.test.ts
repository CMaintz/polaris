import { describe, expect, it } from "vitest";
import { accountName } from "./accounts";

describe("accountName", () => {
  it("adds the platform only when the label does not already say it", () => {
    expect(accountName({ label: "LinkedIn", platform: "linkedin" })).toBe("LinkedIn");
    expect(accountName({ label: "Company page", platform: "linkedin" })).toBe(
      "Company page (LinkedIn)",
    );
    expect(accountName({ label: "Mastodon", platform: "other" })).toBe("Mastodon (Other)");
  });
});
