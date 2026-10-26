import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import type { AnalyticsService } from "../application/analytics/analytics-service";
import type { BREAKDOWN_DIMENSIONS } from "../application/analytics/query-options";
import type { BreakdownsDto } from "../../shared/analytics-types";
import * as input from "./inputs";
import * as output from "./schemas";

export interface Reads {
  analytics: AnalyticsService;
  userId: string;
}

// Every result leaves the machine for whichever model the client uses; the descriptions
// say so because the person granting the tool should know.
const SENT_TO_MODEL = "The result, including post text, goes to the model this client uses.";
const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

const BREAKDOWN_FIELDS = {
  content_type: "contentTypes",
  topic: "topics",
  weekday: "weekdays",
  hour: "hours",
} as const satisfies Record<(typeof BREAKDOWN_DIMENSIONS)[number], keyof BreakdownsDto>;

/** Parses through the output schema first, so only named fields reach the client. */
function reply(schema: z.ZodObject, value: unknown): CallToolResult {
  const data = schema.parse(value) as Record<string, unknown>;
  return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
}

function describe(summary: string) {
  return { description: `${summary} ${SENT_TO_MODEL}`, annotations: READ_ONLY };
}

function registerDashboard(server: McpServer, { analytics, userId }: Reads) {
  const config = {
    ...describe("Account overview: KPIs against the previous period, trends, top posts."),
    inputSchema: input.dashboardInput,
    outputSchema: output.dashboardOutput,
  };
  server.registerTool("dashboard", config, async ({ days, tzOffsetMinutes }) =>
    reply(output.dashboardOutput, await analytics.dashboard(userId, days, tzOffsetMinutes)),
  );
}

function registerListPosts(server: McpServer, { analytics, userId }: Reads) {
  const config = {
    ...describe("Posts with their metrics, filtered by publish date and sorted by a metric."),
    inputSchema: input.listPostsInput,
    outputSchema: output.postPageOutput,
  };
  server.registerTool("list_posts", config, async (query) =>
    reply(output.postPageOutput, await analytics.posts(userId, query)),
  );
}

function registerGetPost(server: McpServer, { analytics, userId }: Reads) {
  const config = {
    ...describe("One post: full text, metric history, account baseline and similar posts."),
    inputSchema: input.getPostInput,
    outputSchema: output.postDetailOutput,
  };
  server.registerTool("get_post", config, async ({ id }) =>
    reply(output.postDetailOutput, await analytics.post(userId, id)),
  );
}

function registerTimeseries(server: McpServer, { analytics, userId }: Reads) {
  const config = {
    ...describe("One account metric over time, bucketed by day, week or month."),
    inputSchema: input.timeseriesInput,
    outputSchema: output.seriesOutput,
  };
  server.registerTool("timeseries", config, async ({ metric, interval, rolling, ...range }) =>
    reply(
      output.seriesOutput,
      await analytics.timeseries(userId, metric, interval, range, rolling),
    ),
  );
}

function registerBreakdowns(server: McpServer, { analytics, userId }: Reads) {
  const config = {
    ...describe("Median post performance per content type, topic, weekday or hour."),
    inputSchema: input.breakdownsInput,
    outputSchema: output.breakdownOutput,
  };
  server.registerTool("breakdowns", config, async ({ dimension, tzOffsetMinutes }) => {
    const all = await analytics.breakdowns(userId, tzOffsetMinutes);
    const segments = all[BREAKDOWN_FIELDS[dimension]];
    return reply(output.breakdownOutput, { dimension, segments, postsWithTime: all.postsWithTime });
  });
}

function registerRuleInsights(server: McpServer, { analytics, userId }: Reads) {
  const config = {
    ...describe("Polaris's rule-based findings (no AI), each with the evidence behind it."),
    inputSchema: input.ruleInsightsInput,
    outputSchema: output.insightsOutput,
  };
  server.registerTool("rule_insights", config, async ({ tzOffsetMinutes }) =>
    reply(output.insightsOutput, { insights: await analytics.insights(userId, tzOffsetMinutes) }),
  );
}

function registerAudience(server: McpServer, { analytics, userId }: Reads) {
  const config = {
    ...describe("Latest audience demographics by dimension and a year of weekly followers."),
    outputSchema: output.audienceOutput,
  };
  server.registerTool("audience", config, async () =>
    reply(output.audienceOutput, await analytics.audience(userId)),
  );
}

export function registerTools(server: McpServer, reads: Reads): void {
  for (const register of [
    registerDashboard,
    registerListPosts,
    registerGetPost,
    registerTimeseries,
    registerBreakdowns,
    registerRuleInsights,
    registerAudience,
  ]) {
    register(server, reads);
  }
}
