import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8 } from "fflate";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpContext } from "../composition/mcp";
import { createMcpServer } from "../mcp/server";
import { type TestContainer, importAndWait, signedInClient, testContainer } from "../test-support";

/**
 * A database file written through the web app's own container, since the MCP server opens
 * its own read-only connection and cannot see an in-memory database.
 */
export function databaseFile() {
  const dir = mkdtempSync(join(tmpdir(), "polaris-mcp-"));
  const dbPath = join(dir, "polaris.db");
  const container = testContainer({ dbPath, dataDir: dir });
  const cleanup = () => {
    container.db.close();
    rmSync(dir, { recursive: true, force: true });
  };
  return { dir, dbPath, container, cleanup };
}

/** Registers a user with a non-LinkedIn account and imports the given posts CSV into it. */
export async function userWithPosts(container: TestContainer, email: string, csv: string) {
  const client = await signedInClient(container, email);
  await client.request("/accounts", {
    method: "POST",
    body: JSON.stringify({ platform: "other", label: "Blog" }),
  });
  const job = await importAndWait(container, client, { "posts.csv": strToU8(csv) });
  if (job.status !== "completed") throw new Error(`import failed: ${job.error}`);
  return client.userId;
}

export function postIdByText(container: TestContainer, text: string): string {
  const row = container.db.prepare("SELECT id FROM posts WHERE text = ?").get(text) as
    { id: string } | undefined;
  if (!row) throw new Error(`no post with text ${text}`);
  return row.id;
}

/** An MCP client talking to the Polaris server over an in-memory transport. */
export async function connectClient(context: McpContext): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createMcpServer(context).connect(serverSide);
  const client = new Client({ name: "polaris-test", version: "0.0.0" });
  await client.connect(clientSide);
  return client;
}

/** Registers a user and loads the synthetic demo dataset, which fills every analytics view. */
export async function userWithDemo(container: TestContainer, email: string) {
  const client = await signedInClient(container, email);
  await client.request("/imports/demo", { method: "POST" });
  await container.worker.drain();
  return client.userId;
}
