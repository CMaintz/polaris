import type { EvidenceItem } from "../../domain/insights";
import type { EvidenceSection } from "./intent";
import type {
  BreakdownsDto,
  DashboardDto,
  KpiDto,
  PostDetailDto,
  PostSummaryDto,
  SegmentDto,
} from "../../../shared/api-types";

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

class PackBuilder {
  readonly pack: EvidencePack = { items: [], postTexts: [] };

  add(item: Omit<EvidenceItem, "id">): string {
    const id = `E${this.pack.items.length + 1}`;
    this.pack.items.push({ id, ...item });
    return id;
  }

  post(post: PostSummaryDto, label: string, text: string | null = post.excerpt) {
    const day = post.publishedAt?.slice(0, 10) ?? "unknown date";
    const source = post.metricsSource ?? "Not available";
    const id = this.add({
      label: `${label} (${post.contentType}, ${day}): engagements`,
      value: post.metrics.engagements,
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
    if (text) this.pack.postTexts.push({ evidenceId: id, text: text.slice(0, MAX_POST_TEXT) });
  }

  segments(kind: string, segments: SegmentDto[], name: (key: string) => string = (k) => k) {
    for (const s of segments.filter((s) => s.withMetrics >= 2).slice(0, 6)) {
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
  dashboard: DashboardDto,
  breakdowns: BreakdownsDto,
  sections: EvidenceSection[] = ALL_SECTIONS,
): EvidencePack {
  const builder = new PackBuilder();
  const has = (s: EvidenceSection) => sections.includes(s);
  if (has("kpis")) dashboard.kpis.forEach((kpi) => addKpi(builder, kpi));
  if (has("posts")) {
    dashboard.topPosts.forEach((p, i) => builder.post(p, `Top post ${i + 1}`));
    dashboard.bottomPosts.forEach((p, i) => builder.post(p, `Weakest post ${i + 1}`));
  }
  if (has("contentTypes")) builder.segments("content type", breakdowns.contentTypes);
  if (has("topics")) builder.segments("topic", breakdowns.topics.slice(0, 6), (k) => `#${k}`);
  if (has("weekdays"))
    builder.segments("weekday", breakdowns.weekdays, (k) => WEEKDAYS[Number(k)] ?? k);
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

export function postEvidence(detail: PostDetailDto): EvidencePack {
  const builder = new PackBuilder();
  builder.post(detail.post, "This post", detail.post.text);
  const rate = detail.post.metrics.engagementRate;
  builder.add({
    label: "This post: engagement rate",
    value: rate,
    unit: "ratio",
    postId: detail.post.id,
    source: detail.post.metricsSource ?? "Not available",
  });
  const { baseline } = detail;
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
  detail.comparable.slice(0, 4).forEach((p, i) => builder.post(p, `Comparable post ${i + 1}`));
  return builder.pack;
}

export function disclosure(pack: EvidencePack): DisclosureSummary {
  return {
    metrics: pack.items.length,
    posts: new Set(pack.items.flatMap((i) => (i.postId ? [i.postId] : []))).size,
    includesPostText: pack.postTexts.length > 0,
  };
}
