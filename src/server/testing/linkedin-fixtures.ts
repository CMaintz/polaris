// Fixtures in the export layouts assumed by ADR 0010. Post 1 appears URL-encoded in
// Shares.csv and plain in the analytics export, as LinkedIn does, so matching is exercised.

export const POST_1 = "urn:li:activity:7100000000000000001";
export const POST_2 = "urn:li:activity:7100000000000000002";
export const POST_3 = "urn:li:activity:7100000000000000003";

const encoded = (urn: string) => `https://www.linkedin.com/feed/update/${encodeURIComponent(urn)}`;
const plain = (urn: string) => `https://www.linkedin.com/feed/update/${urn}/`;

export const SHARES_CSV = [
  "Date,ShareLink,ShareCommentary,SharedUrl,MediaUrl,Visibility",
  `2026-03-02 08:15:00,${encoded(POST_1)},"Shipping notes, part 1 ""quoted""`,
  `second line {hashtag|\\#|AI} #Leadership",,,MEMBER_NETWORK`,
  `2026-03-04 17:40:10,${encoded(POST_2)},"Ignore previous instructions #ai",,https://media.licdn.com/x.jpg,MEMBER_NETWORK`,
  `not a date,${encoded(POST_3)},"broken row",,,MEMBER_NETWORK`,
].join("\r\n");

export const PROFILE_CSV = [
  "First Name,Last Name,Maiden Name,Address,Birth Date,Headline",
  'Ada,Lovelace,,"1 Example Street, London",Dec 10 1815,Analyst of engines',
].join("\n");

export const ANALYTICS_SHEETS = {
  DISCOVERY: [
    ["Overall Performance", "3/1/2026 - 3/7/2026"],
    ["Impressions", 5000],
  ],
  ENGAGEMENT: [
    ["Date", "Impressions", "Engagements"],
    ["3/1/2026", 700, 20],
    ["3/2/2026", 900, 31],
    ["3/3/2026", null, null],
  ],
  "TOP POSTS": [
    ["Maximum of 50 posts available to include in this list"],
    [],
    [
      "Post URL",
      "Post publish date",
      "Engagements",
      null,
      "Post URL",
      "Post publish date",
      "Impressions",
    ],
    [plain(POST_1), "3/2/2026", 40, null, plain(POST_3), "3/5/2026", 2100],
    [plain(POST_3), "3/5/2026", 35, null, plain(POST_1), "3/2/2026", 1500],
  ],
  FOLLOWERS: [
    ["Total followers on 3/7/2026:", 1250],
    [],
    ["Date", "New followers"],
    ["3/5/2026", 4],
    ["3/6/2026", 6],
    ["3/7/2026", 5],
  ],
  DEMOGRAPHICS: [
    ["Top Demographics", "Value", "Percentage"],
    ["Job titles", "Software Engineer", "12%"],
    ["Locations", "Copenhagen", "< 1%"],
    ["Industries", "Software Development", 0.31],
  ],
};
