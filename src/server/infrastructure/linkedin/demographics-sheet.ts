import { type Cell, cellText, parseNumber } from "../csv/values";
import { column, findHeader } from "./workbook-tables";

export function readDemographics(rows: Cell[][]) {
  const header = findHeader(rows, ["Top Demographics", "Value", "Percentage"]);
  if (!header) return [];
  const [dimension, value, share] = ["Top Demographics", "Value", "Percentage"].map((h) =>
    column(header.headers, h),
  );
  return rows.slice(header.index + 1).flatMap((row) => {
    const dim = cellText(row[dimension ?? -1]);
    const val = cellText(row[value ?? -1]);
    if (!dim || !val) return [];
    return [{ dimension: dim, value: val, share: toShare(row[share ?? -1]) }];
  });
}

/** LinkedIn writes shares as 0.12, "12%" or "< 1%"; Polaris stores fractions. */
function toShare(cell: Cell): number | null {
  const text = cellText(cell).replace(/^<\s*/, "");
  const number = parseNumber(text);
  if (number === null) return null;
  return number > 1 ? number / 100 : number;
}
