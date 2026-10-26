import { Hono } from "hono";
import type { MetricRefreshService } from "../../application/refresh/refresh-service";
import { type AppEnv, currentUser, requireUser } from "../http";
import { toJobDto } from "./jobs";

export function refreshRoutes(refresh: MetricRefreshService) {
  return new Hono<AppEnv>()
    .use(requireUser)
    .get("/", async (c) => c.json(await refresh.status(currentUser(c).id)))
    .post("/", async (c) => {
      const job = await refresh.start(currentUser(c).id);
      return c.json({ job: toJobDto(job) }, 202);
    });
}
