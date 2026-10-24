import { NOT_AVAILABLE } from "../../lib/format";

export const coverage = (observed: number, total: number) =>
  observed < total ? `${observed} of ${total} days` : `all ${total} days`;

export const perThousand = (value: number | null) =>
  value === null ? NOT_AVAILABLE : `${value.toFixed(2)} per 1,000 impressions`;
