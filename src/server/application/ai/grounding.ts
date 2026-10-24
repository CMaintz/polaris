import type { Confidence, EvidenceItem } from "../../domain/insight-types";
import type { EvidencePack } from "./evidence";

const LOWER: Record<Confidence, Confidence> = { high: "medium", medium: "low", low: "low" };

export interface Grounded {
  evidence: EvidenceItem[];
  /** Citations to ids that were not in the evidence pack, and so were dropped. */
  invented: string[];
}

/**
 * Resolves a model's citations to the stored evidence. The model only ever cites ids; the
 * values shown to the user come from the pack, so a model cannot slip in its own numbers.
 */
export function ground(evidenceIds: string[], pack: EvidencePack): Grounded {
  const byId = new Map(pack.items.map((item) => [item.id, item]));
  const unique = [...new Set(evidenceIds.map((id) => id.trim().toUpperCase()))];
  return {
    evidence: unique.flatMap((id) => {
      const item = byId.get(id);
      return item ? [item] : [];
    }),
    invented: unique.filter((id) => !byId.has(id)),
  };
}

/** Lowers confidence when a claim cited evidence that does not exist or cited none at all. */
export function adjustConfidence(stated: Confidence, grounded: Grounded): Confidence {
  if (grounded.evidence.length === 0) return "low";
  return grounded.invented.length > 0 ? LOWER[stated] : stated;
}
