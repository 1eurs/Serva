import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type Ctx, ok, run, need, guardDestructive } from "../util.js";

const DESTRUCTIVE = new Set(["delete"]);

export function registerTables(server: McpServer, { client, config }: Ctx): void {
  server.registerTool(
    "serva_tables",
    {
      title: "Tables & QR codes",
      description:
        "The tables customers scan: list them, add one, rename or activate/deactivate it, and regenerate its QR " +
        "(which invalidates the old printed code). Destructive (needs SERVA_ALLOW_DESTRUCTIVE=1): delete.",
      inputSchema: {
        action: z.enum(["list", "create", "update", "delete", "regenerate_qr"]),
        branchId: z.number().optional().describe("Branch scope for list/create. Defaults to your account's branch."),
        tableId: z.number().optional().describe("Target table (update/delete/regenerate_qr)."),
        tableNumber: z.string().optional().describe("Table label/number (create/update)."),
        active: z.boolean().optional(),
      },
    },
    (args) =>
      run(async () => {
        guardDestructive(config, args.action, DESTRUCTIVE);
        const a = args.action;
        switch (a) {
          case "list": {
            const branch = await client.branchId(args.branchId);
            const { data } = await client.request("GET", `/api/branches/${branch}/tables`);
            return ok(data);
          }
          case "create": {
            const branch = await client.branchId(args.branchId);
            const { data, message } = await client.request("POST", `/api/branches/${branch}/tables`, {
              body: { tableNumber: need(args.tableNumber, "tableNumber", a) },
            });
            return ok(data, message);
          }
          case "update": {
            const id = need(args.tableId, "tableId", a);
            const { data, message } = await client.request("PATCH", `/api/tables/${id}`, {
              body: { tableNumber: args.tableNumber, active: args.active },
            });
            return ok(data, message);
          }
          case "delete": {
            const id = need(args.tableId, "tableId", a);
            const { message } = await client.request("DELETE", `/api/tables/${id}`);
            return ok(null, message ?? "Table deleted.");
          }
          case "regenerate_qr": {
            const id = need(args.tableId, "tableId", a);
            const { data, message } = await client.request("POST", `/api/tables/${id}/regenerate-qr`);
            return ok(data, message);
          }
          default:
            return ok(null, `Unknown action '${a}'.`);
        }
      }),
  );
}
