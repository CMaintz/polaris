import { type Clock, nowIso } from "../clock";
import { NotFoundError, ValidationError } from "../errors";
import type {
  Cadence,
  ScheduleDto,
  ScheduleInput,
  ScheduleParams,
} from "../../../shared/intelligence-types";
import type { PeerStore } from "./research-ports";
import type { ScheduleStore } from "./schedule-ports";

const MAX_SCHEDULES = 20;
const MAX_QUESTION = 500;

export class ScheduleService {
  constructor(
    private readonly schedules: ScheduleStore,
    private readonly peers: PeerStore,
    private readonly clock: Clock,
  ) {}

  list(accountId: string): Promise<ScheduleDto[]> {
    return this.schedules.list(accountId);
  }

  async create(accountId: string, input: ScheduleInput): Promise<ScheduleDto> {
    if ((await this.schedules.list(accountId)).length >= MAX_SCHEDULES) {
      throw new ValidationError(`You can have up to ${MAX_SCHEDULES} schedules`);
    }
    const params = await this.params(accountId, input);
    const now = nowIso(this.clock);
    // The first run happens on the next tick: enabling a schedule is asking for it to run.
    return this.schedules.create(accountId, { ...input, params, nextRunAt: now }, now);
  }

  async update(
    accountId: string,
    id: string,
    patch: { cadence?: Cadence; enabled?: boolean },
  ): Promise<ScheduleDto> {
    const schedule = await this.schedules.update(accountId, id, patch, nowIso(this.clock));
    if (!schedule) throw new NotFoundError("Schedule");
    return schedule;
  }

  async remove(accountId: string, id: string): Promise<void> {
    if (!(await this.schedules.delete(accountId, id))) throw new NotFoundError("Schedule");
  }

  private async params(accountId: string, input: ScheduleInput): Promise<ScheduleParams> {
    const { kind, params } = input;
    if (kind === "account_review") return { tz: params.tz ?? 0 };
    if (kind === "trend_digest") return { withAi: params.withAi ?? true };
    if (kind === "feed_refresh") return {};
    const question = params.question?.trim() ?? "";
    if (!question || question.length > MAX_QUESTION) {
      throw new ValidationError(
        `A research schedule needs a question of 1 to ${MAX_QUESTION} characters`,
      );
    }
    if (params.peerId && !(await this.peers.get(accountId, params.peerId))) {
      throw new NotFoundError("Peer");
    }
    return { question, peerId: params.peerId ?? null };
  }
}
