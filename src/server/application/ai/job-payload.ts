import { z } from "zod";
import { parsePayload } from "../jobs/payload";

const common = { tz: z.number().int(), label: z.string().optional() };

const aiPayload = z.discriminatedUnion("task", [
  z.object({ task: z.literal("account_review"), ...common }),
  z.object({ task: z.literal("post_review"), postId: z.string().min(1), ...common }),
  z.object({ task: z.literal("ask"), question: z.string().min(1), ...common }),
]);

export type AiPayload = z.infer<typeof aiPayload>;

export const parseAiPayload = (payload: unknown): AiPayload => parsePayload(aiPayload, payload);
