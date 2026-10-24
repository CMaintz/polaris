/**
 * RFC 4180 CSV: quoted fields may hold commas, doubled quotes and line breaks, which
 * LinkedIn post text routinely does. Returns rows of raw strings; a BOM is stripped.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || row.length > 0) rows.push([...row, field]);
  return rows.filter((r) => r.some((value) => value.trim() !== ""));
}

/** Maps rows to objects keyed by normalised header (lower-case, no spaces or punctuation). */
export function csvRecords(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const keys = header.map(normaliseHeader);
  return rows.map((row) => Object.fromEntries(keys.map((key, i) => [key, row[i] ?? ""])));
}

export function normaliseHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** First non-empty value among header aliases, so renamed columns still map. */
export function pick(record: Record<string, string>, ...aliases: string[]): string | null {
  for (const alias of aliases) {
    const value = record[normaliseHeader(alias)]?.trim();
    if (value) return value;
  }
  return null;
}
