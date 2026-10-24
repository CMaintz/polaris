import type { Account, ContentStore } from "../content/ports";
import type { Dataset } from "../../domain/content";
import { assignBands } from "../../domain/posts";
import { type Loaded, latestDay } from "./account-series";
import type { ContentQueries } from "./ports";

/** Everything stored for the active account; empty, not an error, before the first import. */
export async function loadAccountData(
  content: ContentStore,
  queries: ContentQueries,
  userId: string,
): Promise<Loaded> {
  const account = await content.findAccount(userId);
  if (!account) return { account, posts: [], days: [], bands: new Map(), asOf: null };
  return loadAccount(queries, account);
}

export async function loadAccount(queries: ContentQueries, account: Account): Promise<Loaded> {
  const [posts, days] = await Promise.all([
    queries.posts(account.id),
    queries.accountDays(account.id),
  ]);
  return { account, posts, days, bands: assignBands(posts), asOf: latestDay(posts, days) };
}

export async function holdsDataset(
  content: ContentStore,
  data: Loaded,
  dataset: Dataset,
): Promise<boolean> {
  return data.account ? content.hasDataset(data.account.id, dataset) : false;
}
