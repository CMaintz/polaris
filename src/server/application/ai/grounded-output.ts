import type { EvidenceItem } from "../../domain/insight-types";
import type { EvidencePack } from "./evidence";
import { adjustConfidence, ground } from "./grounding";
import type { Intent } from "./intent";
import type { Analysis, Answer } from "./prompts";
import type { AiInsight, Recommendation } from "./store";

export interface AnswerResult {
  answer: string;
  caveats: string[];
  evidence: EvidenceItem[];
  intent: Intent;
  basedOnDemoData: boolean;
  interactionId: string;
}

interface Provenance {
  basedOnDemo: boolean;
  createdAt: string;
  interactionId: string;
}

type Scope = Pick<AiInsight, "scope" | "postId">;

export function groundedInsights(
  analysis: Analysis,
  pack: EvidencePack,
  saved: Provenance & Scope,
): Omit<AiInsight, "id">[] {
  return analysis.insights.slice(0, 6).map(({ evidenceIds, confidence, ...text }) => {
    const grounded = ground(evidenceIds, pack);
    return {
      ...saved,
      ...text,
      confidence: adjustConfidence(confidence, grounded),
      evidence: grounded.evidence,
    };
  });
}

export function groundedRecommendations(
  analysis: Analysis,
  pack: EvidencePack,
  saved: Provenance,
): Omit<Recommendation, "id">[] {
  return analysis.recommendations
    .slice(0, 5)
    .flatMap(({ evidenceIds, recommendation, rationale }) => {
      const grounded = ground(evidenceIds, pack);
      // A recommendation with no real evidence behind it is exactly what docs/01 rules out.
      if (grounded.evidence.length === 0) return [];
      const status = "open" as const;
      return [{ ...saved, recommendation, rationale, evidence: grounded.evidence, status }];
    });
}

export function groundedAnswer(
  output: Answer,
  pack: EvidencePack,
  context: { intent: Intent; basedOnDemoData: boolean; interactionId: string },
): AnswerResult {
  const grounded = ground(output.evidenceIds, pack);
  const caveats = [...output.caveats];
  if (grounded.invented.length > 0)
    caveats.push("Some cited figures were not in your data and were removed.");
  return { answer: output.answer, caveats, evidence: grounded.evidence, ...context };
}
