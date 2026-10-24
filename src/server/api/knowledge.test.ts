import { strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import type { SearchResponseDto } from "../../shared/knowledge-types";
import { SHARES_CSV } from "../testing/linkedin-fixtures";
import { signedInClient, testContainer, uploadFiles } from "../test-support";

describe("knowledge in the running app", () => {
  it("finds imported posts by keyword and queues indexing after each import", async () => {
    const container = testContainer();
    const client = await signedInClient(container);
    await uploadFiles(container, client, { "Shares.csv": strToU8(SHARES_CSV) });
    await container.worker.drain();

    const response = await client.request("/knowledge/search?q=shipping");
    const body = (await response.json()) as SearchResponseDto;
    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(1);
    const indexJobs = await container.jobs.listForUser(client.userId, "knowledge-index", 5);
    expect(indexJobs).toHaveLength(1);
  });
});
