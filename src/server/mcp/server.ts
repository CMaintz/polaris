import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import pkg from "../../../package.json" with { type: "json" };
import { type Reads, registerTools } from "./tools";

const INSTRUCTIONS = [
  "Read-only access to one person's imported Polaris social-media analytics.",
  "Tools return measured data, not analysis: null means the source did not report a value,",
  "never zero. Posts marked dataset 'demo' are synthetic.",
].join(" ");

export function createMcpServer(reads: Reads): McpServer {
  const server = new McpServer(
    { name: "polaris", version: pkg.version },
    { instructions: INSTRUCTIONS },
  );
  registerTools(server, reads);
  return server;
}
