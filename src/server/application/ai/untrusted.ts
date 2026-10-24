// Imported posts, fetched feeds and user questions all reach prompts. Text from any of
// them is data, never instructions (docs/09), so every prompt fences it with these.

/** Escapes text so it cannot close or open the tags that fence it. */
export function escapeTags(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** For labels inside a line-based list, where a newline would forge a new entry. */
export function inlineText(text: string): string {
  return escapeTags(text).replace(/\s+/g, " ");
}

/** Wraps untrusted text in a tag; attribute values must be ids Polaris generated. */
export function fenced(tag: string, text: string, attributes = ""): string {
  const open = attributes ? `<${tag} ${attributes}>` : `<${tag}>`;
  return `${open}\n${escapeTags(text)}\n</${tag}>`;
}
