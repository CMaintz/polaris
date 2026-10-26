/** Which slice of the account's data a question needs (docs/03 s9 step 1). */
export type Intent = "followers" | "topics" | "timing" | "formats" | "posts" | "overview";

export type EvidenceSection = "kpis" | "posts" | "contentTypes" | "topics" | "weekdays";

// Checked in order: the first matching rule wins.
const RULES: [Intent, RegExp][] = [
  ["followers", /\bfollow(er|ers|ing)?\b|\baudience growth\b/i],
  ["timing", /\b(when|time|times|day|days|hour|weekday|weekend|morning|evening|schedule)\b/i],
  ["topics", /\b(topic|topics|theme|themes|hashtag|hashtags|subject|subjects)\b|#\w+/i],
  [
    "formats",
    /\b(format|formats|video|videos|image|images|carousel|document|documents|article|articles|poll|type)\b/i,
  ],
  ["posts", /\b(post|posts|best|worst|top|bottom|viral)\b/i],
];

export const SECTIONS: Record<Intent, EvidenceSection[]> = {
  followers: ["kpis"],
  timing: ["weekdays", "kpis"],
  topics: ["topics", "posts"],
  formats: ["contentTypes", "posts"],
  posts: ["posts", "kpis"],
  overview: ["kpis", "posts", "contentTypes", "topics", "weekdays"],
};

export function classifyQuestion(question: string): Intent {
  return RULES.find(([, pattern]) => pattern.test(question))?.[0] ?? "overview";
}
