/** Whether the active account can refresh its figures from LinkedIn's API, and if not, why. */
export type MetricRefreshState =
  "available" | "not_linkedin" | "not_enabled" | "not_connected" | "expired" | "missing_scopes";

export interface MetricRefreshStatusDto {
  state: MetricRefreshState;
  /** Posts with a share or ugcPost URN; LinkedIn's API cannot look up the rest. */
  refreshablePosts: number;
  totalPosts: number;
}
