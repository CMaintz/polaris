import type { ResolveAccount } from "../content/ports";
import type { ProposalStatus } from "../../domain/proposals";
import type { AuditLog } from "../auth/ports";
import { type Clock, nowIso } from "../clock";
import { ConflictError, NotFoundError } from "../errors";
import { PAYLOAD_SCHEMAS } from "./appliers";
import type { NewProposal, Proposal, ProposalApplier, ProposalStore } from "./ports";

export interface ProposalDeps {
  store: ProposalStore;
  appliers: ProposalApplier[];
  resolveAccount: ResolveAccount;
  audit: AuditLog;
  clock: Clock;
}

/**
 * The approval gate (docs/06): a proposal changes data only through `approve`, and only the
 * call whose decision lands applies it, so a double click or a retry applies it once.
 */
export class ProposalService {
  constructor(private readonly deps: ProposalDeps) {}

  async list(userId: string, status?: ProposalStatus): Promise<Proposal[]> {
    const accountId = await this.deps.resolveAccount(userId);
    return accountId ? this.deps.store.list(accountId, status) : [];
  }

  async propose(accountId: string, proposals: NewProposal[], jobId: string | null) {
    const valid = proposals.filter((p) => PAYLOAD_SCHEMAS[p.kind].safeParse(p.payload).success);
    await this.deps.store.createMany(accountId, valid, jobId, nowIso(this.deps.clock));
    return valid.length;
  }

  async proposedByJob(jobId: string): Promise<number> {
    return this.deps.store.countForJob(jobId);
  }

  async approve(userId: string, id: string): Promise<Proposal> {
    const { accountId, proposal } = await this.find(userId, id);
    const decided = await this.deps.store.decide(accountId, id, "approved", userId, this.now());
    if (!decided) {
      if (proposal.status === "rejected") {
        throw new ConflictError("A rejected proposal cannot be applied");
      }
      return (await this.deps.store.get(accountId, id)) ?? proposal;
    }
    await this.deps.audit.record(userId, "proposal.approved", { id, kind: proposal.kind });
    await this.apply(userId, accountId, proposal);
    return (await this.deps.store.get(accountId, id)) as Proposal;
  }

  async reject(userId: string, id: string): Promise<Proposal> {
    const { accountId, proposal } = await this.find(userId, id);
    const decided = await this.deps.store.decide(accountId, id, "rejected", userId, this.now());
    if (!decided && proposal.status !== "rejected") {
      throw new ConflictError("This proposal has already been applied");
    }
    if (decided)
      await this.deps.audit.record(userId, "proposal.rejected", { id, kind: proposal.kind });
    return (await this.deps.store.get(accountId, id)) as Proposal;
  }

  private async apply(userId: string, accountId: string, proposal: Proposal) {
    const { store, audit } = this.deps;
    try {
      const record = await this.applierFor(proposal).apply(userId, this.payloadOf(proposal));
      await store.finish(accountId, proposal.id, { status: "applied", recordId: record.id });
      await audit.record(userId, "proposal.applied", { id: proposal.id, recordId: record.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await store.finish(accountId, proposal.id, { status: "failed", error: message });
      await audit.record(userId, "proposal.apply_failed", { id: proposal.id, error: message });
    }
  }

  private payloadOf(proposal: Proposal): unknown {
    const parsed = PAYLOAD_SCHEMAS[proposal.kind].safeParse(proposal.payload);
    if (!parsed.success) throw new Error("The proposal's details are no longer valid");
    return parsed.data;
  }

  private applierFor(proposal: Proposal): ProposalApplier {
    const applier = this.deps.appliers.find((a) => a.kind === proposal.kind);
    if (!applier) throw new Error(`No applier for ${proposal.kind} proposals`);
    return applier;
  }

  private async find(userId: string, id: string) {
    const accountId = await this.deps.resolveAccount(userId);
    const proposal = accountId ? await this.deps.store.get(accountId, id) : null;
    if (!accountId || !proposal) throw new NotFoundError("Proposal");
    return { accountId, proposal };
  }

  private now() {
    return nowIso(this.deps.clock);
  }
}
