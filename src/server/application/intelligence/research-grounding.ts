import type {
  ResearchFindingDto,
  ResearchReportBody,
  ResearchSourceDto,
} from "../../../shared/intelligence-types";
import type { AccountContext } from "./context";
import type { WebSource } from "./ports";
import type { ReportOutput } from "./prompts";

const MAX_FINDINGS = 8;

/** The URL when it is http(s), else null. Anything else (javascript:, data:) is never a link. */
export function httpUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function numberSources(sources: WebSource[]): ResearchSourceDto[] {
  return sources.map((s, i) => ({ id: `S${i + 1}`, title: s.title || s.url, url: httpUrl(s.url) }));
}

function groundFindings(output: ReportOutput, sources: ResearchSourceDto[]) {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const findings: ResearchFindingDto[] = [];
  let unsupported = 0;
  for (const { finding, sourceIds } of output.findings.slice(0, MAX_FINDINGS)) {
    const cited = [...new Set(sourceIds)].flatMap((id) => byId.get(id) ?? []);
    // A finding that cites no source the search returned is the model's own claim.
    if (cited.length === 0) unsupported += 1;
    else findings.push({ finding, sources: cited });
  }
  return { findings, unsupported };
}

function groundRelation(output: ReportOutput, context: AccountContext) {
  const known = new Set(context.topics);
  const posts = new Map(context.topPosts.map((p, i) => [`P${i + 1}`, p]));
  return {
    text: output.relation.text,
    topics: output.relation.topics
      .map((t) => t.replace(/^#/, "").toLowerCase())
      .filter((t) => known.has(t)),
    posts: [...new Set(output.relation.postIds)].flatMap((id) => {
      const post = posts.get(id);
      return post ? [{ id: post.id, label: post.label }] : [];
    }),
  };
}

export function groundReport(
  output: ReportOutput,
  sources: ResearchSourceDto[],
  context: AccountContext,
  interactionIds: string[],
): ResearchReportBody {
  const { findings, unsupported } = groundFindings(output, sources);
  const caveats = [...output.caveats];
  if (unsupported > 0) caveats.push(`${unsupported} finding(s) without a source were left out.`);
  if (sources.length === 0) caveats.push("The web search returned no sources.");
  return {
    summary: output.summary,
    findings,
    relation: groundRelation(output, context),
    caveats,
    sources,
    basedOnDemoData: context.hasDemoData,
    interactionIds,
  };
}
