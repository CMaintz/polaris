import type { z } from "zod";
import { PermanentJobError } from "../errors";

/**
 * Job payloads are stored JSON, so a payload from an older release or a bad enqueue must
 * fail the job for good rather than run with guessed fields. Retrying cannot fix it.
 */
export function parsePayload<T>(schema: z.ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success)
    throw new PermanentJobError("The job's request is not one Polaris understands");
  return parsed.data;
}
