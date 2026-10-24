// The Posts API reads `commentary` as "little" text, where these characters are markup and
// must be backslash-escaped to stay literal:
// https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/little-text-format
const RESERVED = /[\\|{}@[\]()<>#*_~]/g;

/**
 * Escapes a plain-text post for the Posts API. A `#` that starts a word is left alone so it
 * stays a hashtag, which little text supports unescaped; every other reserved character is
 * escaped, so a stray `@[x](urn:...)` in a draft can never become a mention.
 */
export function toLittleText(text: string): string {
  return text.replace(RESERVED, (char, offset: number) => {
    if (char === "#" && isHashtagStart(text, offset)) return char;
    return `\\${char}`;
  });
}

function isHashtagStart(text: string, offset: number): boolean {
  const before = offset === 0 ? "" : text.charAt(offset - 1);
  const after = text.charAt(offset + 1);
  return !/[\p{L}\p{N}_]/u.test(before) && /[\p{L}\p{N}]/u.test(after);
}
