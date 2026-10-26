import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { openMcpContext } from "../composition/mcp";
import { createMcpServer } from "./server";

// stdout carries the JSON-RPC stream, so anything this process says goes to stderr.
const context = await openMcpContext(process.env).catch((error: unknown) => {
  console.error(`Polaris MCP: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

const transport = new StdioServerTransport();
transport.onclose = () => context.close();
await createMcpServer(context).connect(transport);
console.error(`Polaris MCP serving user ${context.userId}`);

const shutdown = () => {
  context.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
