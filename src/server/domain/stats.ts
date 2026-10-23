/** Drops unavailable values. Unavailable is not zero, so it must never be averaged in. */
export function present(values: readonly (number | null)[]): number[] {
  return values.filter((value): value is number => value !== null);
}

export function sumOrNull(values: readonly (number | null)[]): number | null {
  const known = present(values);
  return known.length === 0 ? null : known.reduce((total, value) => total + value, 0);
}

export function meanOrNull(values: readonly (number | null)[]): number | null {
  const known = present(values);
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0) / known.length;
}

/** Linear-interpolated percentile, `p` in [0, 1]. */
export function percentile(values: readonly (number | null)[], p: number): number | null {
  const sorted = present(values).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const rank = (sorted.length - 1) * p;
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  const lowValue = sorted[low] as number;
  const highValue = sorted[high] as number;
  return lowValue + (highValue - lowValue) * (rank - low);
}

export function median(values: readonly (number | null)[]): number | null {
  return percentile(values, 0.5);
}

export interface Growth {
  absolute: number | null;
  /** Fractional change (0.25 = +25%); null when the base is missing or zero. */
  percent: number | null;
}

export function growth(previous: number | null, current: number | null): Growth {
  if (previous === null || current === null) return { absolute: null, percent: null };
  const absolute = current - previous;
  return { absolute, percent: previous === 0 ? null : absolute / Math.abs(previous) };
}
