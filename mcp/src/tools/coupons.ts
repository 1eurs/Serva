import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type Ctx, ok, run, need, guardDestructive } from "../util.js";

const DESTRUCTIVE = new Set(["delete"]);

const couponItem = z.object({
  menuItemId: z.number(),
  percentOff: z.number().int().describe("Percent off this item, 0–100."),
});

export function registerCoupons(server: McpServer, { client, config }: Ctx): void {
  server.registerTool(
    "serva_coupons",
    {
      title: "Discount coupons",
      description:
        "Per-item discount codes: list them, suggest a fresh code, create/update one (a code plus the items it " +
        "discounts and by how much), look one up by code, and delete. Destructive (needs SERVA_ALLOW_DESTRUCTIVE=1): delete.",
      inputSchema: {
        action: z.enum(["list", "suggest", "create", "update", "delete", "lookup"]),
        id: z.number().optional().describe("Coupon id (update/delete)."),
        code: z.string().optional().describe("Coupon code (create/update/lookup)."),
        prefix: z.string().optional().describe("Optional prefix for suggest."),
        label: z.string().optional(),
        active: z.boolean().optional(),
        items: z.array(couponItem).optional().describe("At least one item for create/update."),
      },
    },
    (args) =>
      run(async () => {
        guardDestructive(config, args.action, DESTRUCTIVE);
        const a = args.action;
        switch (a) {
          case "list": {
            const { data } = await client.request("GET", "/api/coupons");
            return ok(data);
          }
          case "suggest": {
            const { data } = await client.request("GET", "/api/coupons/suggest", {
              query: { prefix: args.prefix },
            });
            return ok(data);
          }
          case "lookup": {
            const { data } = await client.request("GET", "/api/coupons/lookup", {
              query: { code: need(args.code, "code", a) },
            });
            return ok(data);
          }
          case "create": {
            const body = {
              code: need(args.code, "code", a),
              label: args.label,
              active: args.active,
              items: need(args.items, "items", a),
            };
            const { data, message } = await client.request("POST", "/api/coupons", { body });
            return ok(data, message);
          }
          case "update": {
            const id = need(args.id, "id", a);
            const body = {
              code: need(args.code, "code", a),
              label: args.label,
              active: args.active,
              items: need(args.items, "items", a),
            };
            const { data, message } = await client.request("PATCH", `/api/coupons/${id}`, { body });
            return ok(data, message);
          }
          case "delete": {
            const id = need(args.id, "id", a);
            const { message } = await client.request("DELETE", `/api/coupons/${id}`);
            return ok(null, message ?? "Coupon deleted.");
          }
          default:
            return ok(null, `Unknown action '${a}'.`);
        }
      }),
  );
}
