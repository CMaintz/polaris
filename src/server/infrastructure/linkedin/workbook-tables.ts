import { normaliseHeader } from "../csv/csv";
import { type Cell, cellText } from "../csv/values";

export interface Period {
  from: string;
  to: string;
}

export interface HeaderRow {
  index: number;
  headers: string[];
}

/** The first row that holds every `required` header, compared after normaliseHeader. */
export function findHeader(rows: Cell[][], required: string[]): HeaderRow | null {
  const wanted = required.map(normaliseHeader);
  for (let index = 0; index < rows.length; index += 1) {
    const headers = (rows[index] ?? []).map((cell) => normaliseHeader(cellText(cell)));
    if (wanted.every((h) => headers.includes(h))) return { index, headers };
  }
  return null;
}

export function column(headers: string[], name: string, from = 0): number {
  return headers.indexOf(normaliseHeader(name), from);
}
