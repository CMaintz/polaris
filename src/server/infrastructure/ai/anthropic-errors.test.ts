import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { translateAnthropicError } from "./anthropic-errors";

describe("translateAnthropicError", () => {
  it("treats the SDK's own parse failure as bad output, not as an outage worth retrying", () => {
    const error = translateAnthropicError(
      new Anthropic.AnthropicError("Failed to parse structured output"),
    );
    expect(error.kind).toBe("invalid_output");
    expect(error.retryable).toBe(false);
  });

  it("does not pass the provider's message through to the user", () => {
    const bad = new Anthropic.BadRequestError(
      400,
      { message: "secret detail" },
      "secret detail",
      new Headers(),
    );
    expect(translateAnthropicError(bad).message).not.toContain("secret detail");
  });
});
