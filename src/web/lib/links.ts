/**
 * Post URLs come from imported files, so a crafted export could carry a `javascript:` URL or
 * point elsewhere. Only https links on LinkedIn itself are rendered as links.
 */
export function linkedInUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const onLinkedIn = host === "linkedin.com" || host.endsWith(".linkedin.com");
    return parsed.protocol === "https:" && onLinkedIn ? url : null;
  } catch {
    return null;
  }
}
