import type { EvidenceFacts } from "../analytics/evidence-facts";
import type { RelatedPosts } from "./related-posts";
import { PERIOD_DAYS } from "../../domain/dates";
import { type EvidencePack, accountEvidence, disclosure, postEvidence } from "./evidence";
import { type Intent, SECTIONS, classifyQuestion } from "./intent";
import type { AiPayload } from "./job-payload";
import {
  ACCOUNT_REVIEW,
  ASK_DATA,
  type Analysis,
  type Answer,
  POST_REVIEW,
  type PromptTemplate,
  renderPrompt,
} from "./prompts";

interface Common {
  pack: EvidencePack;
  demo: boolean;
}

/** One AI task, with the evidence gathered for it. */
export type Prepared = Common &
  (
    | { task: "account_review"; template: PromptTemplate<Analysis> }
    | { task: "post_review"; template: PromptTemplate<Analysis>; postId: string }
    | { task: "ask"; template: PromptTemplate<Answer>; intent: Intent; question: string }
  );

export interface PrepareDeps {
  facts: EvidenceFacts;
  related: RelatedPosts;
}

export async function prepare(
  { facts, related }: PrepareDeps,
  job: { id: string; userId: string },
  payload: AiPayload,
): Promise<Prepared> {
  const { userId } = job;
  if (payload.task === "post_review") {
    const post = await facts.post(userId, payload.postId);
    const { postId } = payload;
    return {
      task: "post_review",
      template: POST_REVIEW,
      pack: postEvidence(post),
      demo: post.basedOnDemo,
      postId,
    };
  }
  const account = await facts.account(userId, PERIOD_DAYS, payload.tz);
  const demo = account.basedOnDemo;
  if (payload.task === "account_review") {
    return {
      task: "account_review",
      template: ACCOUNT_REVIEW,
      pack: accountEvidence(account),
      demo,
    };
  }
  const intent = classifyQuestion(payload.question);
  const posts = await related.find(userId, payload.question, job.id);
  const pack = accountEvidence(account, SECTIONS[intent], posts);
  return { task: "ask", template: ASK_DATA, pack, demo, intent, question: payload.question };
}

/** What was sent, for the interaction log (docs/09). Never the post text or the question. */
export function inputSummary(prepared: Prepared, provider: string): Record<string, unknown> {
  return { ...disclosure(prepared.pack), ...taskDetail(prepared), provider, demo: prepared.demo };
}

function taskDetail(prepared: Prepared) {
  if (prepared.task === "post_review") return { postId: prepared.postId };
  if (prepared.task === "ask") return { intent: prepared.intent };
  return {};
}

export function promptFor(prepared: Prepared): string {
  const question = prepared.task === "ask" ? prepared.question : undefined;
  return renderPrompt(prepared.pack, { demo: prepared.demo, question });
}
