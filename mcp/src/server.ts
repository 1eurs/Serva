import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Ctx } from "./util.js";
import { registerAllTools } from "./tools/index.js";

export const INSTRUCTIONS =
  "Operate a Serva café exactly as its owner can. Each tool is one business area (orders, menu, " +
  "stock, till, analytics, tables, staff, loyalty, coupons, customers, restaurant/branches, reports) " +
  "and takes an `action`. If you're unsure which café or branch is in context, call " +
  "serva_account action=me first. Branch-scoped tools default to your account's branch; if it isn't " +
  "pinned to one, pass branchId (list with serva_restaurant action=branches). Destructive actions " +
  "are disabled unless the server allows them; a read-only API key blocks all writes server-side.";

/** Build a fully-wired MCP server for one caller (one ServaClient). */
export function buildServer(ctx: Ctx): McpServer {
  const server = new McpServer({ name: "serva", version: "1.0.0" }, { instructions: INSTRUCTIONS });
  registerAllTools(server, ctx);
  return server;
}
