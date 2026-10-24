import type { ContentQueries } from "../analytics/ports";
import { displayText } from "../../domain/content";
import { totalEngagements } from "../../domain/metrics";

export interface TopPost {
  id: string;
  label: string;
  text: string;
  engagements: number;
}

export interface AccountContext {
  /** Hashtag topics (ADR 0015), most used first. */
  topics: string[];
  topPosts: TopPost[];
  hasDemoData: boolean;
}

export type PostSource = Pick<ContentQueries, "posts">;

const TOP_POSTS = 5;
const MAX_POST_TEXT = 1200;

function topicsByUse(posts: { topics: string[] }[]): string[] {
  const counts = new Map<string, number>();
  for (const post of posts) for (const t of post.topics) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t]) => t);
}

export async function accountContext(
  source: PostSource,
  accountId: string,
): Promise<AccountContext> {
  const posts = await source.posts(accountId);
  const rated = posts.flatMap((post) => {
    const engagements = totalEngagements(post.metrics);
    // An unknown engagement count is not a low one, so unrated posts are left out.
    return engagements === null ? [] : [{ post, engagements }];
  });
  const topPosts = rated
    .sort((a, b) => b.engagements - a.engagements)
    .slice(0, TOP_POSTS)
    .map(({ post, engagements }) => {
      const text = (displayText(post.text) ?? "").slice(0, MAX_POST_TEXT);
      const label =
        text.replace(/\s+/g, " ").slice(0, 80) ||
        `Post ${post.publishedAt?.slice(0, 10) ?? ""}`.trim();
      return { id: post.id, label, text, engagements };
    });
  return {
    topics: topicsByUse(posts),
    topPosts,
    hasDemoData: posts.some((p) => p.dataset === "demo"),
  };
}
