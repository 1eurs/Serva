import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type Ctx, ok, run, need } from "../util.js";

export function registerCustomers(server: McpServer, { client }: Ctx): void {
  server.registerTool(
    "serva_customers",
    {
      title: "Blocked phones",
      description:
        "Customer moderation: list the phone numbers blocked from ordering, block a number (with an optional reason), " +
        "and unblock one. (For customer insight/history, use serva_analytics customer_directory.)",
      inputSchema: {
        action: z.enum(["list", "block", "unblock"]),
        id: z.number().optional().describe("Block entry id (unblock)."),
        phone: z.string().optional().describe("Phone to block."),
        reason: z.string().optional(),
      },
    },
    (args) =>
      run(async () => {
        const a = args.action;
        switch (a) {
          case "list": {
            const { data } = await client.request("GET", "/api/dashboard/blocked-phones");
            return ok(data);
          }
          case "block": {
            const { data, message } = await client.request("POST", "/api/dashboard/blocked-phones", {
              body: { phone: need(args.phone, "phone", a), reason: args.reason },
            });
            return ok(data, message);
          }
          case "unblock": {
            const id = need(args.id, "id", a);
            const { message } = await client.request("DELETE", `/api/dashboard/blocked-phones/${id}`);
            return ok(null, message ?? "Phone unblocked.");
          }
          default:
            return ok(null, `Unknown action '${a}'.`);
        }
      }),
  );
}
