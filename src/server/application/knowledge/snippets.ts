import type { SnippetSegment } from "../../../shared/knowledge-types";
import { SNIPPET_MARK } from "./ports";

/** Splits a marked snippet into plain-text runs, so no markup ever reaches the browser. */
export function segments(marked: string): SnippetSegment[] {
  const parts = marked.split(SNIPPET_MARK.open);
  const out: SnippetSegment[] = [];
  parts.forEach((part, i) => {
    const [hit, rest] = i === 0 ? [null, part] : splitOnce(part, SNIPPET_MARK.close);
    if (hit) out.push({ text: hit, hit: true });
    if (rest) out.push({ text: rest, hit: false });
  });
  return out;
}

function splitOnce(text: string, separator: string): [string, string] {
  const at = text.indexOf(separator);
  return at < 0 ? [text, ""] : [text.slice(0, at), text.slice(at + separator.length)];
}
