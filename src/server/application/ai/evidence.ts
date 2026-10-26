import { displayText } from "../../domain/content";
import type { EvidenceItem } from "../../domain/insights";
import { postMetricValue } from "../../domain/metrics";
import type { PostRecord, SegmentPerformance } from "../../domain/posts";
import type { KpiDto } from "../../../shared/api-types";
import type { AccountFacts, PostFacts } from "../analytics/evidence-facts";
import { sourceLabel } from "../analytics/presenters";
import type { EvidenceSection } from "./intent";

/** The facts a prompt may use, numbered so the model can cite them and we can check it. */
export interface EvidencePack {
  items: EvidenceItem[];
  /** Untrusted post text, keyed to the evidence item of the post it belongs to. */
  postTexts: { evidenceId: string; text: string }[];
}

/** What goes to the provider, recorded for docs/09's "know what data is being sent". */
export interface DisclosureSummary {
  metrics: number;
  posts: number;
  includesPostText: boolean;
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MAX_POST_TEXT = 600;
const MAX_SEGMENTS = 6;

class PackBuilder {
  readonly pack: EvidencePack = { items: [], postTexts: [] };

  add(item: Omit<EvidenceItem, "id">): string {
    const id = `E${this.pack.items.length + 1}`;
    this.pack.items.push({ id, ...item });
    return id;
  }

  post(post: PostRecord, label: string) {
    const day = post.publishedAt?.slice(0, 10) ?? "unknown date";
    const source = sourceLabel(post.metricsProvider);
    const id = this.add({
      label: `${label} (${post.contentType}, ${day}): engagements`,
      value: postMetricValue(post.metrics, "engagements"),
      unit: "count",
      postId: post.id,
      source,
    });
    this.add({
      label: `${label} (${day}): impressions`,
      value: post.metrics.impressions,
      unit: "count",
      postId: post.id,
      source,
    });
    const text = displayText(post.text);
    if (text) this.pack.postTexts.push({ evidenceId: id, text: text.slice(0, MAX_POST_TEXT) });
  }

  /** Groups of one post say nothing about a pattern, so only larger ones are sent. */
  segments(kind: string, segments: SegmentPerformance[], name: (key: string) => string = (k) => k) {
    for (const s of segments.filter((s) => s.withMetrics >= 2).slice(0, MAX_SEGMENTS)) {
      this.add({
        label: `Median engagements, ${kind} ${name(s.key)} (${s.withMetrics} posts)`,
        value: s.medianEngagements,
        unit: "count",
        source: "Your imported posts",
      });
    }
  }
}

const ALL_SECTIONS: EvidenceSection[] = ["kpis", "posts", "contentTypes", "topics", "weekdays"];

/** Account-level facts, limited to the sections a task needs (docs/09: send only what is needed). */
export function accountEvidence(
  facts: AccountFacts,
  sections: EvidenceSection[] = ALL_SECTIONS,
): EvidencePack {
  const builder = new PackBuilder();
  const has = (s: EvidenceSection) => sections.includes(s);
  if (has("kpis")) facts.kpis.forEach((kpi) => addKpi(builder, kpi));
  if (has("posts")) {
    facts.topPosts.forEach((p, i) => builder.post(p, `Top post ${i + 1}`));
    facts.bottomPosts.forEach((p, i) => builder.post(p, `Weakest post ${i + 1}`));
  }
  if (has("contentTypes")) builder.segments("content type", facts.contentTypes);
  if (has("topics")) builder.segments("topic", facts.topics, (k) => `#${k}`);
  if (has("weekdays")) builder.segments("weekday", facts.weekdays, (k) => WEEKDAYS[Number(k)] ?? k);
  return builder.pack;
}

function addKpi(builder: PackBuilder, kpi: KpiDto) {
  builder.add({
    label: `${kpi.label}, current period`,
    value: kpi.value,
    unit: kpi.unit,
    period: kpi.period,
    source: kpi.source,
  });
  builder.add({
    label: `${kpi.label}, previous period`,
    value: kpi.previous,
    unit: kpi.unit,
    period: kpi.previousPeriod,
    source: kpi.source,
  });
}

export function postEvidence({ post, baseline, comparable }: PostFacts): EvidencePack {
  const builder = new PackBuilder();
  builder.post(post, "This post");
  builder.add({
    label: "This post: engagement rate",
    value: postMetricValue(post.metrics, "engagement_rate"),
    unit: "ratio",
    postId: post.id,
    source: sourceLabel(post.metricsProvider),
  });
  builder.add({
    label: `Median engagements across your other ${baseline.withMetrics} posts with metrics`,
    value: baseline.medianEngagements,
    unit: "count",
    source: "Your imported posts",
  });
  builder.add({
    label: "Median impressions across your other posts",
    value: baseline.medianImpressions,
    unit: "count",
    source: "Your imported posts",
  });
  comparable.slice(0, 4).forEach((p, i) => builder.post(p, `Comparable post ${i + 1}`));
  return builder.pack;
}

export function disclosure(pack: EvidencePack): DisclosureSummary {
  return {
    metrics: pack.items.length,
    posts: new Set(pack.items.flatMap((i) => (i.postId ? [i.postId] : []))).size,
    includesPostText: pack.postTexts.length > 0,
  };
}
