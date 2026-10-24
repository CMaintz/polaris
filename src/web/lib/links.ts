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

/** Model output and feed items carry URLs too; only web links are rendered as links. */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}
