import type { TermMode } from "./ports";

// Letters and digits only: quotes, parentheses, colons and operator words in a query are
// FTS5 syntax, so they never reach the index as anything but plain words.
const WORD = /[\p{L}\p{N}]+/gu;
const MAX_TERMS = 12;
const MAX_TERM_LENGTH = 40;

// A question asked of the Ask pipeline is mostly function words; matching any one of them
// would rank every post.
const STOPWORDS = new Set(
  (
    "a about after all am an and any are as at be been before but by can could did do does " +
    "for from had has have how i if in into is it its me more most my of on or our should so " +
    "than that the their them then there these they this to was we were what when where which " +
    "who why will with would you your best worst posts post"
  ).split(" "),
);

// "any" mode drops stopwords, unless only stopwords remain.
export function queryTerms(query: string, mode: TermMode): string[] {
  const words = [
    ...new Set((query.toLowerCase().match(WORD) ?? []).map((w) => w.slice(0, MAX_TERM_LENGTH))),
  ];
  const content = mode === "any" ? words.filter((w) => !STOPWORDS.has(w)) : words;
  return (content.length > 0 ? content : words).slice(0, MAX_TERMS);
}
