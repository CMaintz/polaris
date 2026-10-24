import type { PostFacts } from "../analytics/evidence-facts";
import type { RelatedPost, RelatedPosts } from "../ai/related-posts";
import type { ResolveAccount } from "../content/ports";
import type { KnowledgeSearch } from "./search-service";

const RELATED_LIMIT = 4;

/** docs/03 s9 step 3: the Ask pipeline's retrieval, backed by keyword and meaning search. */
export class SearchRelatedPosts implements RelatedPosts {
  constructor(
    private readonly deps: {
      resolveAccount: ResolveAccount;
      search: Pick<KnowledgeSearch, "retrieveContext">;
      facts: { post(userId: string, postId: string): Promise<PostFacts> };
    },
  ) {}

  async find(userId: string, question: string, jobId: string): Promise<RelatedPost[]> {
    const accountId = await this.deps.resolveAccount(userId);
    if (!accountId) return [];
    const hits = await this.deps.search.retrieveContext(accountId, question, RELATED_LIMIT, {
      jobId,
    });
    return Promise.all(
      hits.map(async (hit) => ({
        post: (await this.deps.facts.post(userId, hit.postId)).post,
        reason: hit.reason,
      })),
    );
  }
}
