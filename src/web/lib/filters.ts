export const PAGE_PARAM = "offset";

/** A filter change returns to the first page, since the old offset may be past the new end. */
export function withParam(params: URLSearchParams, key: string, value: string): URLSearchParams {
  const next = new URLSearchParams(params);
  if (key !== PAGE_PARAM) next.delete(PAGE_PARAM);
  if (value) next.set(key, value);
  else next.delete(key);
  return next;
}
