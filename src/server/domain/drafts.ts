/** LinkedIn's limit on a member post's text (ADR 0024). */
export const LINKEDIN_POST_LIMIT = 3000;

export interface LengthCheck {
  length: number;
  limit: number;
  over: boolean;
}

/**
 * Counts UTF-16 code units, which is never less than the number of characters a person sees,
 * so a draft that passes here cannot be rejected by LinkedIn for being too long.
 */
export function checkPostLength(text: string): LengthCheck {
  return {
    length: text.length,
    limit: LINKEDIN_POST_LIMIT,
    over: text.length > LINKEDIN_POST_LIMIT,
  };
}

export type VersionOrigin = "user" | "ai" | "restore";

export type PublicationStatus =
  "scheduled" | "publishing" | "awaiting_confirmation" | "published" | "failed" | "cancelled";

/** A publication in one of these states still claims its draft, so the draft is frozen. */
const OPEN: readonly PublicationStatus[] = ["scheduled", "publishing", "awaiting_confirmation"];

export function isOpenPublication(status: PublicationStatus): boolean {
  return OPEN.includes(status);
}

/** Approval belongs to one version: any later save leaves the draft unapproved. */
export function isApproved(draft: { approvedVersion: number | null; version: number }): boolean {
  return draft.approvedVersion !== null && draft.approvedVersion === draft.version;
}
