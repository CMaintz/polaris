import { describe, expect, it } from "vitest";
import { signedInClient, testContainer } from "../test-support";

describe("scheduled publishing in the running app", () => {
  it("hands an approved draft to its provider once it is due, not before", async () => {
    const container = testContainer();
    const client = await signedInClient(container);
    await client.request("/imports/demo", { method: "POST" });
    const post = (path: string, body: object = {}) =>
      client.request(`/action${path}`, { method: "POST", body: JSON.stringify(body) });
    const created = await post("/drafts", { title: "Launch", text: "We shipped it." });
    const { draft } = (await created.json()) as { draft: { id: string } };
    expect((await post(`/drafts/${draft.id}/approve`)).status).toBe(200);
    const at = "2026-03-15T13:00:00.000Z";
    expect((await post(`/drafts/${draft.id}/schedule`, { provider: "manual", at })).status).toBe(
      201,
    );
    const status = () =>
      (container.db.prepare("SELECT status FROM publications").get() as { status: string }).status;

    await container.worker.drain();
    expect(status()).toBe("scheduled");

    container.setNow("2026-03-15T13:05:00.000Z");
    await container.worker.drain();
    await container.worker.drain();
    expect(status()).toBe("awaiting_confirmation");
  });
});
