import { z } from "zod";
import { LinkedInApiError } from "../../application/refresh/ports";
import { formatDay } from "../../domain/dates";

// Response shapes from
// https://learn.microsoft.com/en-us/linkedin/marketing/community-management/members/post-statistics
// https://learn.microsoft.com/en-us/linkedin/marketing/community-management/members/follower-statistics

const date = z.object({ year: z.number(), month: z.number(), day: z.number() });
const dateRange = z.object({ start: date }).optional();

// Up to version 202604 metricType is a union wrapper keyed by its Pegasus type name; from
// 202605 it is the plain string. The version is the server owner's choice, so both are read.
const metricType = z
  .union([z.string(), z.record(z.string(), z.string())])
  .transform((value) => (typeof value === "string" ? value : Object.values(value)[0]));

const postStat = z.object({ count: z.number(), metricType, dateRange });
const followerStat = z.object({ memberFollowersCount: z.number(), dateRange });

const page = <T extends z.ZodType>(element: T) => z.object({ elements: z.array(element) });

export type PostStat = z.infer<typeof postStat>;
export type FollowerStat = z.infer<typeof followerStat>;

function read<T>(schema: z.ZodType<{ elements: T[] }>, body: unknown): T[] {
  const parsed = schema.safeParse(body);
  // A shape change will not fix itself on retry.
  if (!parsed.success)
    throw new LinkedInApiError("LinkedIn's answer was not understood", "refused");
  return parsed.data.elements;
}

export const readPostStats = (body: unknown): PostStat[] => read(page(postStat), body);
export const readFollowerStats = (body: unknown): FollowerStat[] => read(page(followerStat), body);

/** The day a daily element covers: its range starts that day and ends the next. */
export function startDay(stat: { dateRange?: { start: z.infer<typeof date> } }): string | null {
  const start = stat.dateRange?.start;
  return start ? formatDay(new Date(Date.UTC(start.year, start.month - 1, start.day))) : null;
}
