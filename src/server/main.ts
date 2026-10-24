import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { buildContainer } from "./composition";
import { loadConfig } from "./config";

const config = loadConfig();
const container = buildContainer(config);

const app = new Hono();
app.route("/api", container.api);
// Without this, the SPA fallback below would answer unknown API paths with index.html.
app.all("/api/*", (c) => c.json({ error: { code: "not_found", message: "Not found" } }, 404));

const indexHtml = join(config.webDistDir, "index.html");
if (existsSync(indexHtml)) {
  app.use("/*", serveStatic({ root: config.webDistDir }));
  app.get("*", (c) => c.html(readFileSync(indexHtml, "utf8")));
}

await container.worker.start();
serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`Polaris listening on http://${config.host}:${info.port}`);
});

const shutdown = () => {
  container.worker.stop();
  container.db.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
