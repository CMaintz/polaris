import { describe, expect, it } from "vitest";
import { ManualPublishingProvider } from "../../infrastructure/publishing/manual-provider";
import { ConflictError, ValidationError } from "../errors";
import { type ConnectionState, PublishError, type PublishingProvider } from "./ports";
import { PUBLISH_JOB, PublishingService } from "./publishing";
import {
  TEST_CLOCK,
  actionKit,
  present,
  draftService,
  drainJobs,
  planItems,
  resolver,
  stores,
} from "../../testing/action";

class FakeLinkedIn implements PublishingProvider {
  readonly id = "linkedin-api";
  readonly label = "LinkedIn";
  readonly mode = "api" as const;
  posted: string[] = [];
  state: ConnectionState = "connected";
  failure: PublishError | null = null;

  async connectionStatus() {
    return { state: this.state, displayName: "Ada", expiresAt: null };
  }

  async publish(_accountId: string, text: string) {
    if (this.failure) throw this.failure;
    this.posted.push(text);
    return {
      externalId: "urn:li:share:1",
      url: "https://www.linkedin.com/feed/update/urn:li:share:1/",
    };
  }
}

const DUE = "2026-03-15T09:00:00.000Z";
const LATER = "2026-03-20T09:00:00.000Z";

async function setup() {
  const kit = await actionKit();
  const linkedin = new FakeLinkedIn();
  const drafts = draftService(kit.container);
  const publications = stores(kit.container).publications;
  const service = new PublishingService({
    drafts,
    publications,
    providers: [linkedin, new ManualPublishingProvider()],
    planItems: planItems(kit.container),
    resolveAccount: resolver(kit.container),
    jobs: kit.container.jobs,
    audit: kit.container.audit,
    clock: TEST_CLOCK,
  });
  const item = await planItems(kit.container).create(
    kit.accountId,
    {
      title: "Hiring",
      concept: "",
      targetTopic: "",
      plannedDate: null,
      status: "planned",
      draft: "",
      postId: null,
    },
    DUE,
  );
  const draft = await drafts.create(kit.user.userId, {
    title: "t",
    text: "Hello LinkedIn",
    planItemId: item.id,
  });
  await drafts.approve(kit.user.userId, draft.id);
  const tick = async () => {
    await service.enqueueDue(TEST_CLOCK().toISOString());
    await drainJobs(kit.container, { [PUBLISH_JOB]: (job) => service.run(job) });
  };
  const read = async (id: string) => present(await publications.get(kit.accountId, id));
  return { ...kit, linkedin, drafts, publications, service, draft, item, tick, read };
}

describe("publishing an approved draft", () => {
  it("posts once when due, stores the post id and marks the plan item published", async () => {
    const { service, user, draft, linkedin, tick, read, container, accountId, item } =
      await setup();
    const { id } = await service.schedule(user.userId, draft.id, {
      provider: "linkedin-api",
      at: DUE,
    });
    await tick();
    await tick();
    expect(linkedin.posted).toEqual(["Hello LinkedIn"]);
    expect(await read(id)).toMatchObject({
      status: "published",
      externalId: "urn:li:share:1",
      url: "https://www.linkedin.com/feed/update/urn:li:share:1/",
    });
    expect((await planItems(container).get(accountId, item.id))?.status).toBe("published");
  });

  it("never calls the provider again after an interrupted attempt", async () => {
    const { service, user, draft, linkedin, read, publications, accountId, container } =
      await setup();
    const { id } = await service.schedule(user.userId, draft.id, {
      provider: "linkedin-api",
      at: DUE,
    });
    await service.enqueueDue(TEST_CLOCK().toISOString());
    const [job] = await container.jobs.listForUser(user.userId, PUBLISH_JOB);
    // A crash after the post went out but before the result was stored leaves this state.
    await publications.transition(accountId, id, ["scheduled"], "publishing", {}, DUE);
    await expect(service.run(present(job))).rejects.toThrow(/may or may not have published/);
    await expect(service.run(present(job))).resolves.toEqual({ status: "failed" });
    expect(linkedin.posted).toEqual([]);
    expect((await read(id)).status).toBe("failed");
  });

  it("does not post before the scheduled time", async () => {
    const { service, user, draft, linkedin, tick, read } = await setup();
    const { id } = await service.schedule(user.userId, draft.id, {
      provider: "linkedin-api",
      at: LATER,
    });
    await tick();
    expect(linkedin.posted).toEqual([]);
    expect((await read(id)).status).toBe("scheduled");
  });

  it("fails instead of posting when the connection was lost before the due time", async () => {
    const { service, user, draft, linkedin, tick, read } = await setup();
    const { id } = await service.schedule(user.userId, draft.id, {
      provider: "linkedin-api",
      at: DUE,
    });
    linkedin.state = "expired";
    await tick();
    expect(linkedin.posted).toEqual([]);
    expect((await read(id)).error).toMatch(/reconnect/);
  });

  it("records an ambiguous failure as one the user must check", async () => {
    const { service, user, draft, linkedin, tick, read } = await setup();
    linkedin.failure = new PublishError("socket hang up", "unknown");
    const { id } = await service.schedule(user.userId, draft.id, {
      provider: "linkedin-api",
      at: DUE,
    });
    await tick();
    expect(await read(id)).toMatchObject({ status: "failed" });
    expect((await read(id)).error).toMatch(/Check your profile/);
  });

  it("refuses to schedule an unapproved or disconnected draft", async () => {
    const { service, drafts, user, draft, linkedin } = await setup();
    await drafts.save(user.userId, draft.id, "Edited after approval");
    await expect(
      service.schedule(user.userId, draft.id, { provider: "linkedin-api", at: DUE }),
    ).rejects.toBeInstanceOf(ConflictError);
    await drafts.approve(user.userId, draft.id);
    linkedin.state = "not_connected";
    await expect(
      service.schedule(user.userId, draft.id, { provider: "linkedin-api", at: DUE }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("manual publishing", () => {
  it("hands the user a share link, then records the link they confirm", async () => {
    const { service, user, draft, tick, read } = await setup();
    const { id } = await service.schedule(user.userId, draft.id, { provider: "manual", at: DUE });
    await tick();
    const waiting = await read(id);
    expect(waiting.status).toBe("awaiting_confirmation");
    expect(waiting.url).toContain("text=Hello%20LinkedIn");
    await expect(service.confirm(user.userId, id, "javascript:alert(1)")).rejects.toBeInstanceOf(
      ValidationError,
    );
    const postUrl = "https://www.linkedin.com/feed/update/urn:li:activity:7/";
    await service.confirm(user.userId, id, postUrl);
    expect(await read(id)).toMatchObject({ status: "published", url: postUrl });
  });
});
