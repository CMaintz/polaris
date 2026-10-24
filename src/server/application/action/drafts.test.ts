import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { DraftService } from "./drafts";
import { actionKit, planItems, resolver, secondUser, stores } from "../../testing/action";

const NOW = "2026-03-15T12:00:00Z";

async function setup() {
  const kit = await actionKit();
  const { drafts, publications } = stores(kit.container);
  const service = new DraftService({
    drafts,
    publications,
    planItems: planItems(kit.container),
    resolveAccount: resolver(kit.container),
    audit: kit.container.audit,
    clock: () => new Date("2026-03-15T12:00:00Z"),
  });
  const draft = await service.create(kit.user.userId, {
    title: "Hiring",
    text: "First",
    planItemId: null,
  });
  return { ...kit, service, draft, publications };
}

describe("draft versions", () => {
  it("keeps every save as a version and restores an old one as a new version", async () => {
    const { service, user, draft } = await setup();
    await service.save(user.userId, draft.id, "Second");
    const restored = await service.restore(user.userId, draft.id, 1);
    expect(restored).toMatchObject({ version: 3, text: "First" });
    const { versions } = await service.detail(user.userId, draft.id);
    expect(versions.map((v) => [v.version, v.text, v.origin])).toEqual([
      [3, "First", "restore"],
      [2, "Second", "user"],
      [1, "First", "user"],
    ]);
  });

  it("drops approval when the text changes, so only approved text can be published", async () => {
    const { service, user, draft } = await setup();
    expect(await service.approve(user.userId, draft.id)).toMatchObject({ approved: true });
    const edited = await service.save(user.userId, draft.id, "Changed after approval");
    expect(edited).toMatchObject({ approved: false, approvedVersion: null });
  });

  it("refuses to approve a draft over LinkedIn's limit", async () => {
    const { service, user, draft } = await setup();
    await service.save(user.userId, draft.id, "x".repeat(3001));
    await expect(service.approve(user.userId, draft.id)).rejects.toBeInstanceOf(ValidationError);
    await service.save(user.userId, draft.id, "x".repeat(3000));
    expect(await service.approve(user.userId, draft.id)).toMatchObject({ approved: true });
  });

  it("freezes a draft while it is scheduled", async () => {
    const { service, user, draft, publications, accountId } = await setup();
    await service.approve(user.userId, draft.id);
    await publications.create(
      accountId,
      {
        draftId: draft.id,
        draftVersion: 1,
        text: "First",
        provider: "manual",
        scheduledFor: "2026-03-16T09:00:00Z",
      },
      "2026-03-15T12:00:00Z",
    );
    await expect(service.save(user.userId, draft.id, "Sneaky edit")).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});

describe("draft ownership", () => {
  it("only links a plan item from the same account", async () => {
    const { service, container, user, accountId } = await setup();
    const other = await secondUser(container);
    const plan = planItems(container);
    const foreign = await plan.create(
      other.accountId,
      {
        title: "Theirs",
        concept: "",
        targetTopic: "",
        plannedDate: null,
        status: "idea",
        draft: "",
        postId: null,
      },
      NOW,
    );
    await expect(
      service.create(user.userId, { title: "t", text: "x", planItemId: foreign.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
    const own = await plan.create(accountId, { ...foreign, title: "Mine" }, NOW);
    const linked = await service.create(user.userId, { title: "t", text: "x", planItemId: own.id });
    expect(linked.planItemId).toBe(own.id);
  });

  it("hides one account's drafts from another", async () => {
    const { service, container, draft } = await setup();
    const other = await secondUser(container);
    expect(await service.list(other.user.userId)).toEqual([]);
    await expect(service.detail(other.user.userId, draft.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.save(other.user.userId, draft.id, "x")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(service.remove(other.user.userId, draft.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
