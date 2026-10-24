// A deliberately small XML reader for feeds. It never processes a DTD (a document that
// declares one is refused), so no entity can be defined, expanded or fetched: billion-laughs
// and XXE have nothing to work with. Only the five predefined entities and numeric character
// references are decoded.

export class FeedParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedParseError";
  }
}

export interface XmlElement {
  /** Lower-cased qualified name, such as "item" or "dc:date". */
  name: string;
  attrs: Record<string, string>;
  children: (XmlElement | string)[];
}

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, ref: string) => {
    const lower = ref.toLowerCase();
    if (!lower.startsWith("#")) return NAMED[lower] ?? whole;
    const code = lower.startsWith("#x") ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

function endOf(text: string, from: number, marker: string): number {
  const at = text.indexOf(marker, from);
  if (at === -1) throw new FeedParseError("The document ends in the middle of a tag");
  return at + marker.length;
}

function tagEnd(text: string, from: number): number {
  let quote: string | null = null;
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (quote) quote = ch === quote ? null : quote;
    else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ">") return i + 1;
  }
  throw new FeedParseError("The document ends in the middle of a tag");
}

function parseTag(source: string): { element: XmlElement; selfClosing: boolean } {
  const selfClosing = source.endsWith("/");
  const body = selfClosing ? source.slice(0, -1) : source;
  const name = /^[^\s/>]+/.exec(body)?.[0]?.toLowerCase();
  if (!name) throw new FeedParseError("A tag has no name");
  const attrs: Record<string, string> = {};
  for (const m of body.slice(name.length).matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attrs[(m[1] ?? "").toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? "");
  }
  return { element: { name, attrs, children: [] }, selfClosing };
}

function closeTag(stack: XmlElement[], name: string): void {
  const at = stack.map((e) => e.name).lastIndexOf(name);
  // A stray closing tag is ignored; feeds in the wild are often slightly malformed.
  if (at > 0) stack.length = at;
}

function consume(text: string, lt: number, stack: XmlElement[]): number {
  const top = stack[stack.length - 1] as XmlElement;
  if (text.startsWith("<!--", lt)) return endOf(text, lt + 4, "-->");
  if (text.startsWith("<![CDATA[", lt)) {
    const end = endOf(text, lt + 9, "]]>");
    top.children.push(text.slice(lt + 9, end - 3));
    return end;
  }
  if (text.startsWith("<!", lt)) throw new FeedParseError("Feeds with a DOCTYPE are not accepted");
  if (text.startsWith("<?", lt)) return endOf(text, lt + 2, "?>");
  const end = tagEnd(text, lt + 1);
  const source = text.slice(lt + 1, end - 1).trim();
  if (source.startsWith("/")) {
    closeTag(stack, source.slice(1).trim().toLowerCase());
    return end;
  }
  const { element, selfClosing } = parseTag(source);
  top.children.push(element);
  if (!selfClosing) stack.push(element);
  return end;
}

export function parseXml(text: string): XmlElement {
  const document: XmlElement = { name: "#document", attrs: {}, children: [] };
  const stack = [document];
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    const top = stack[stack.length - 1] as XmlElement;
    if (lt === -1) break;
    if (lt > i) top.children.push(decodeEntities(text.slice(i, lt)));
    i = consume(text, lt, stack);
  }
  const root = document.children.find((c): c is XmlElement => typeof c !== "string");
  if (!root) throw new FeedParseError("The document has no XML elements");
  return root;
}

export function children(element: XmlElement, name: string): XmlElement[] {
  return element.children.filter((c): c is XmlElement => typeof c !== "string" && c.name === name);
}

export function textOf(element: XmlElement | undefined): string {
  if (!element) return "";
  return element.children.map((c) => (typeof c === "string" ? c : textOf(c))).join("");
}
