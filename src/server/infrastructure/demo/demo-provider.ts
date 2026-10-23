import type { ImportBundle, ImportedPost, ImportedPostMetrics } from "../../domain/content";
import { emptyBundle } from "../../domain/content";
import { addDays, parseDay } from "../../domain/dates";

const DEMO_PROVIDER = "demo";

const TOPICS = ["leadership", "ai", "careers", "productmanagement", "remotework", "startups"];
const TYPES = ["text", "image", "video", "document", "article", "link"] as const;
const OPENERS = [
  "Three things I learned shipping",
  "Unpopular opinion about",
  "What nobody tells you about",
  "A short thread on",
  "Lessons from a year of",
  "How we rethought",
];

// Built-in patterns, so the demo analytics have something real to find.
const TOPIC_BOOST: Record<string, number> = { ai: 1.6, careers: 1.3 };
const TYPE_BOOST: Record<string, number> = { document: 1.5, video: 1.2 };

/** Mulberry32: a tiny seeded PRNG, so the demo dataset is identical on every load. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function choose<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)] as T;
}

/**
 * A synthetic account for exploring Polaris without real data (ADR 0015). Clearly marked
 * as the "demo" dataset everywhere, and deleted when real data is imported.
 */
export function buildDemoBundle(today: string, days = 270): ImportBundle {
  const rand = random(42);
  const bundle = emptyBundle(DEMO_PROVIDER, "demo");
  const start = addDays(today, -days);
  bundle.profile = { displayName: "Demo Account", headline: "Sample data", profileUrl: null };
  let followers = 1800;
  for (let i = 0; i <= days; i += 1) {
    const day = addDays(start, i);
    const gained = Math.round(3 + rand() * 9 + i / 40);
    followers += gained;
    const impressions = Math.round(400 + rand() * 900 + i * 6);
    bundle.accountDays.push({
      day,
      followers,
      newFollowers: gained,
      impressions,
      engagements: Math.round(impressions * (0.02 + rand() * 0.03)),
    });
    if (rand() < 0.38) addDemoPost(bundle, rand, day, today);
  }
  bundle.audience = { observedOn: today, segments: demoAudience() };
  return bundle;
}

function addDemoPost(bundle: ImportBundle, rand: () => number, day: string, today: string) {
  const index = bundle.posts.length + 1;
  const topic = choose(rand, TOPICS);
  const type = choose(rand, TYPES);
  const hour = 6 + Math.floor(rand() * 13);
  const publishedAt = new Date(parseDay(day).getTime() + hour * 3_600_000).toISOString();
  const post: ImportedPost = {
    externalId: `demo:${index}`,
    url: null,
    text: `${choose(rand, OPENERS)} ${topic}. Sample post ${index} for the Polaris demo. #${topic}`,
    publishedAt,
    timeKnown: true,
    contentType: type,
    sourceMetadata: { demo: true },
  };
  bundle.posts.push(post);
  bundle.postMetrics.push(demoMetrics(post, rand, topic, hour, today));
}

function demoMetrics(
  post: ImportedPost,
  rand: () => number,
  topic: string,
  hour: number,
  today: string,
): ImportedPostMetrics {
  const topicBoost = TOPIC_BOOST[topic] ?? 1;
  const typeBoost = TYPE_BOOST[post.contentType] ?? 1;
  const timeBoost = hour >= 7 && hour <= 9 ? 1.25 : 1;
  const impressions = Math.round((600 + rand() * 2400) * topicBoost * typeBoost * timeBoost);
  const reactions = Math.round(impressions * (0.012 + rand() * 0.025) * topicBoost);
  return {
    externalId: post.externalId,
    observedOn: today,
    metrics: {
      impressions,
      reactions,
      comments: Math.round(reactions * (0.08 + rand() * 0.2)),
      reposts: Math.round(reactions * rand() * 0.08),
      clicks: Math.round(impressions * rand() * 0.01),
      engagements: null,
    },
    period: null,
  };
}

function demoAudience() {
  const segment = (dimension: string, value: string, share: number) => ({
    dimension,
    value,
    share,
  });
  return [
    segment("Job title", "Software Engineer", 0.14),
    segment("Job title", "Product Manager", 0.09),
    segment("Job title", "Engineering Manager", 0.06),
    segment("Location", "Copenhagen Area, Denmark", 0.21),
    segment("Location", "Greater London", 0.07),
    segment("Industry", "Software Development", 0.31),
    segment("Industry", "IT Services and IT Consulting", 0.12),
    segment("Seniority", "Senior", 0.34),
    segment("Seniority", "Entry", 0.15),
    segment("Company size", "10,001+ employees", 0.22),
  ];
}
