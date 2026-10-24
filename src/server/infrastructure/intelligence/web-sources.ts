import type { WebSource } from "../../application/intelligence/research-ports";

const MAX_SOURCES = 20;

export function uniqueSources(found: { url: string; title: string | null }[]): WebSource[] {
  const byUrl = new Map<string, WebSource>();
  for (const { url, title } of found) {
    if (!url || byUrl.has(url)) continue;
    byUrl.set(url, { url, title: title?.trim() || url });
  }
  return [...byUrl.values()].slice(0, MAX_SOURCES);
}
