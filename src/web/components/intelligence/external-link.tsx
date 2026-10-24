import { safeHref } from "../../lib/links";

export function ExternalLink({ url, children }: { url: string | null; children: string }) {
  const href = safeHref(url);
  if (!href) return <span>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  );
}
