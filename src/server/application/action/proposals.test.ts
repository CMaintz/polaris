import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundError } from "../errors";
import { planningAppliers } from "./appliers";
import type { PlanningWriter } from "./ports";
import type { NewProposal, ProposalApplier } from "./proposal-ports";
import { ProposalService } from "./proposals";
import {
  actionKit,
  present,
  auditActions,
  planItems,
  resolver,
  secondUser,
  stores,
} from "../../testing/action";

const planProposal: NewProposal = {
  kind: "plan_item",
  payload: {
    title: "Hiring lessons",
    concept: "c",
    targetTopic: "#hiring",
    plannedDate: "2026-03-20",
  },
  origin: "ai",
  rationale: "Documents do well",
  evidence: [],
  interactionId: null,
  basedOnDemo: false,
};

async function setup(appliers?: ProposalApplier[]) {
  const kit = await actionKit();
  const { container } = kit;
  // Assigning the real service is the check that PlanningService still satisfies the port.
  const writer: PlanningWriter = container.planning;
  const proposalStore = stores(container).proposals;
  const service = new ProposalService({
    store: proposalStore,
    appliers: appliers ?? planningAppliers(writer),
    resolveAccount: resolver(container),
    audit: container.audit,
    clock: () => new Date("2026-03-15T12:00:00Z"),
  });
  await proposalStore.createMany(kit.accountId, [planProposal], null, "2026-03-15T00:00:00Z");
  const [pending] = await service.list(kit.user.userId);
  return { ...kit, service, id: present(pending).id, plan: planItems(container) };
}

describe("proposal approval", () => {
  it("changes nothing until the user approves", async () => {
    const { plan, accountId } = await setup();
    expect(await plan.list(accountId)).toEqual([]);
  });

  it("creates the record once even when approved twice", async () => {
    const { service, plan, accountId, user, id } = await setup();
    await service.approve(user.userId, id);
    const again = await service.approve(user.userId, id);
    const items = await plan.list(accountId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: "Hiring lessons",
      targetTopic: "hiring",
      status: "planned",
    });
    expect(again).toMatchObject({ status: "applied", appliedRecordId: items[0]?.id });
  });

  it("never applies a rejected proposal", async () => {
    const { service, plan, accountId, user, id } = await setup();
    await service.reject(user.userId, id);
    await expect(service.approve(user.userId, id)).rejects.toBeInstanceOf(ConflictError);
    expect(await plan.list(accountId)).toEqual([]);
  });

  it("does not let another account decide a proposal", async () => {
    const { service, container, id } = await setup();
    const other = await secondUser(container);
    await expect(service.approve(other.user.userId, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.reject(other.user.userId, id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("marks the proposal failed when applying throws, and a later approval retries", async () => {
    let calls = 0;
    const flaky: ProposalApplier = {
      kind: "plan_item",
      apply: async () => {
        calls += 1;
        if (calls === 1) throw new Error("database busy");
        return { id: "rec-1" };
      },
    };
    const { service, user, id } = await setup([flaky]);
    expect(await service.approve(user.userId, id)).toMatchObject({
      status: "failed",
      error: "database busy",
    });
    expect(await service.approve(user.userId, id)).toMatchObject({
      status: "applied",
      appliedRecordId: "rec-1",
    });
  });

  it("rejects a stored payload that fails its schema without calling the applier", async () => {
    let called = false;
    const spy: ProposalApplier = {
      kind: "plan_item",
      apply: async () => ((called = true), { id: "x" }),
    };
    const { service, container, accountId, user } = await setup([spy]);
    const proposalStore = stores(container).proposals;
    await proposalStore.createMany(
      accountId,
      [{ ...planProposal, payload: { title: "" } }],
      null,
      "2026-03-15T01:00:00Z",
    );
    const bad = (await service.list(user.userId)).find(
      (p) => (p.payload as { title: string }).title === "",
    );
    expect(await service.approve(user.userId, present(bad).id)).toMatchObject({ status: "failed" });
    expect(called).toBe(false);
  });

  it("audit-logs every decision", async () => {
    const { service, container, user, id } = await setup();
    await service.approve(user.userId, id);
    expect(auditActions(container)).toEqual(
      expect.arrayContaining(["proposal.approved", "proposal.applied"]),
    );
  });
});
