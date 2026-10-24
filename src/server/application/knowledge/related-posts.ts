import type { PostFacts } from "../analytics/evidence-facts";
import type { RelatedPost, RelatedPosts } from "../ai/related-posts";
import type { AccountScope } from "../content/ports";
import type { KnowledgeSearch } from "./search-service";

const RELATED_LIMIT = 4;

/** docs/03 s9 step 3: the Ask pipeline's retrieval, backed by keyword and meaning search. */
export class SearchRelatedPosts implements RelatedPosts {
  constructor(
    private readonly deps: {
      search: Pick<KnowledgeSearch, "retrieveContext">;
      facts: { post(scope: AccountScope, postId: string): Promise<PostFacts> };
    },
  ) {}

  async find(scope: AccountScope, question: string, jobId: string): Promise<RelatedPost[]> {
    const hits = await this.deps.search.retrieveContext(scope.accountId, question, RELATED_LIMIT, {
      jobId,
    });
    return Promise.all(
      hits.map(async (hit) => ({
        post: (await this.deps.facts.post(scope, hit.postId)).post,
        reason: hit.reason,
      })),
    );
  }
}
