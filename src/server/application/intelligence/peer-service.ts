import { type Clock, nowIso } from "../clock";
import { NotFoundError, ValidationError } from "../errors";
import type { PeerDto, PeerInput } from "../../../shared/intelligence-types";
import type { PeerStore } from "./research-ports";
import { httpUrl } from "./research-grounding";

/**
 * A watchlist of people the user wants context on. Polaris stores what the user types and
 * never fetches the profile URL (docs/07): it is a bookmark, not a scraping target.
 */
export class PeerService {
  constructor(
    private readonly peers: PeerStore,
    private readonly clock: Clock,
  ) {}

  list(accountId: string): Promise<PeerDto[]> {
    return this.peers.list(accountId);
  }

  create(accountId: string, input: PeerInput): Promise<PeerDto> {
    return this.peers.create(accountId, clean(input), nowIso(this.clock));
  }

  async replace(accountId: string, id: string, input: PeerInput): Promise<PeerDto> {
    const peer = await this.peers.update(accountId, id, clean(input), nowIso(this.clock));
    if (!peer) throw new NotFoundError("Peer");
    return peer;
  }

  async remove(accountId: string, id: string): Promise<void> {
    if (!(await this.peers.delete(accountId, id))) throw new NotFoundError("Peer");
  }
}

function clean(input: PeerInput): PeerInput {
  const name = input.name.trim();
  if (!name) throw new ValidationError("Give the peer a name");
  const raw = input.profileUrl?.trim() || null;
  const profileUrl = raw === null ? null : httpUrl(raw);
  if (raw !== null && profileUrl === null) {
    throw new ValidationError("The profile URL must start with https:// or http://");
  }
  return { name, profileUrl, notes: input.notes.trim() };
}
