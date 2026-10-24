import type { Account, AccountScope, ContentStore } from "../content/ports";
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
  return loadOrEmpty(queries, await content.findAccount(userId));
}

/** A job's account, fixed when it was queued; empty when the account has since been deleted. */
export async function loadScopedData(
  content: ContentStore,
  queries: ContentQueries,
  { userId, accountId }: AccountScope,
): Promise<Loaded> {
  return loadOrEmpty(queries, await content.ownedAccount(userId, accountId));
}

function loadOrEmpty(queries: ContentQueries, account: Account | null): Promise<Loaded> {
  if (!account)
    return Promise.resolve({ account, posts: [], days: [], bands: new Map(), asOf: null });
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
