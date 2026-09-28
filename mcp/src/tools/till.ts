import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type Ctx, ok, run, need } from "../util.js";

export function registerTill(server: McpServer, { client }: Ctx): void {
  server.registerTool(
    "serva_till",
    {
      title: "Till (the cash drawer)",
      description:
        "The drawer, which is the whole of whether a shop can sell right now: read its state, open it with a starting " +
        "float, close it against a counted cash figure (the variance is the point), and read past sessions.",
      inputSchema: {
        action: z.enum(["status", "open", "close", "sessions"]),
        branchId: z.number().optional().describe("Branch scope. Defaults to your account's branch."),
        openingFloat: z.number().optional().describe("Cash in the drawer when opening (open). Zero is valid."),
        countedCash: z.number().optional().describe("Cash a person actually counted when closing (close)."),
      },
    },
    (args) =>
      run(async () => {
        const branch = await client.branchId(args.branchId);
        const a = args.action;
        switch (a) {
          case "status": {
            const { data } = await client.request("GET", `/api/branches/${branch}/till`);
            return ok(data);
          }
          case "open": {
            const { data, message } = await client.request("POST", `/api/branches/${branch}/till/open`, {
              body: { openingFloat: need(args.openingFloat, "openingFloat", a) },
            });
            return ok(data, message);
          }
          case "close": {
            const { data, message } = await client.request("POST", `/api/branches/${branch}/till/close`, {
              body: { countedCash: need(args.countedCash, "countedCash", a) },
            });
            return ok(data, message);
          }
          case "sessions": {
            const { data } = await client.request("GET", `/api/branches/${branch}/till/sessions`);
            return ok(data);
          }
          default:
            return ok(null, `Unknown action '${a}'.`);
        }
      }),
  );
}
