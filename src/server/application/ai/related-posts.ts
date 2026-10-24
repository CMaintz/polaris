import type { PostRecord } from "../../domain/posts";
import type { AccountScope } from "../content/ports";

/** A post that matched the question, and why, so the model sees why it was included. */
export interface RelatedPost {
  post: PostRecord;
  reason: string;
}

export interface RelatedPosts {
  find(scope: AccountScope, question: string, jobId: string): Promise<RelatedPost[]>;
}
