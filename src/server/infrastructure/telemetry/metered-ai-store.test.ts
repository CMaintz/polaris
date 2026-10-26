import { describe, expect, it } from "vitest";
import { AiProviderError } from "../../application/ai/ports";
import { aiKit, analysis } from "../../testing/ai";

describe("AI call telemetry", () => {
  it("counts each provider call by provider and outcome, failures included", async () => {
    let fail = false;
    const { run, container } = await aiKit(() => {
      if (fail) throw new AiProviderError("auth", "invalid x-api-key for ada@example.com");
      return analysis(["E1"]);
    });
    await run("/ai/reviews/account");
    fail = true;
    await run("/ai/reviews/account");
    const text = container.telemetry.render();
    expect(text).toContain('polaris_ai_calls_total{outcome="succeeded",provider="anthropic"} 1');
    expect(text).toContain('polaris_ai_calls_total{outcome="failed",provider="anthropic"} 1');
    expect(text).not.toContain("ada@example.com");
  });
});
