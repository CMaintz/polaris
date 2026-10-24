import { canonicalUrl } from "../csv/values";

const URN = /urn:li:(activity|share|ugcPost):(\d+)/i;

/**
 * Stable post identity from a LinkedIn URL. LinkedIn URL-encodes the URN in some exports
 * and not in others, so both forms must yield the same id or re-imports would duplicate.
 */
export function externalIdFromUrl(url: string | null): string | null {
  if (!url) return null;
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    // Malformed escapes: match against the raw URL instead.
  }
  const match = URN.exec(decoded);
  if (match) return `urn:li:${match[1]}:${match[2]}`;
  return canonicalUrl(decoded);
}
