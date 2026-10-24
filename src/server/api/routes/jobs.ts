import { Hono } from "hono";
import { NotFoundError } from "../../application/errors";
import type { Job, JobRepository } from "../../application/jobs/ports";
import type { JobDto } from "../../../shared/core-types";
import { type AppEnv, currentUser, requireUser } from "../http";

export function toJobDto(job: Job): JobDto {
  const label = job.payload["label"];
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    progress: job.progress,
    error: job.error,
    result: job.result,
    retryCount: job.retryCount,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    label: typeof label === "string" ? label : null,
  };
}

export function jobRoutes(jobs: JobRepository) {
  return new Hono<AppEnv>()
    .use(requireUser)
    .get("/", async (c) => {
      const type = c.req.query("type");
      const list = await jobs.listForUser(currentUser(c).id, type);
      return c.json({ jobs: list.map(toJobDto) });
    })
    .get("/:id", async (c) => {
      // Scoped by user: another user's job id is indistinguishable from a missing one.
      const job = await jobs.findForUser(currentUser(c).id, c.req.param("id"));
      if (!job) throw new NotFoundError("Job");
      return c.json({ job: toJobDto(job) });
    });
}
