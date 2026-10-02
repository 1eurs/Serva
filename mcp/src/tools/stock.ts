import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type Ctx, ok, run, need, guardDestructive } from "../util.js";
import { STOCK_UNITS } from "../enums.js";

const DESTRUCTIVE = new Set(["delete"]);

const recipeLine = z.object({
  stockItemId: z.number(),
  quantity: z.number(),
  unit: z.enum(STOCK_UNITS),
});
const optionLine = z.object({
  groupName: z.string(),
  optionName: z.string(),
  stockItemId: z.number(),
  replacesStockItemId: z.number().optional(),
  quantity: z.number().optional(),
  unit: z.enum(STOCK_UNITS).optional(),
});

export function registerStock(server: McpServer, { client, config }: Ctx): void {
  server.registerTool(
    "serva_stock",
    {
      title: "Stock (the shelf, recipes & usage)",
      description:
        "The stockroom: shelf items and their quantities, deliveries (receive) and recounts (count), per-item daily " +
        "caps, recipes that tie a menu item to its ingredients, and usage/days-left analytics. Destructive " +
        "(needs SERVA_ALLOW_DESTRUCTIVE=1): delete.",
      inputSchema: {
        action: z.enum([
          "list",
          "create",
          "update",
          "receive",
          "count",
          "delete",
          "usage",
          "rules",
          "set_rule",
          "recipes",
          "option_recipes",
          "set_recipe",
        ]),
        branchId: z.number().optional().describe("Branch scope. Defaults to your account's branch."),
        itemId: z.number().optional().describe("Stock item (update/receive/count/delete)."),
        menuItemId: z.number().optional().describe("Menu item (set_rule/set_recipe)."),
        days: z.number().int().optional().describe("Window for usage (default 7)."),
        // Create / update fields:
        name: z.string().optional().describe("Single name in whichever language; filed by script."),
        nameEn: z.string().optional(),
        nameAr: z.string().optional(),
        unit: z.enum(STOCK_UNITS).optional(),
        quantity: z.number().optional().describe("create: starting quantity. count: the new true quantity."),
        reorderPoint: z.number().optional(),
        unitPrice: z.number().optional(),
        packSize: z.number().optional(),
        packUnit: z.enum(STOCK_UNITS).optional(),
        // Receive:
        amount: z.number().optional().describe("How much arrived (receive)."),
        // Rule:
        dailyLimit: z.number().int().optional().describe("Per-day cap for a menu item; omit to clear the rule."),
        // Recipe:
        lines: z.array(recipeLine).optional().describe("Ingredient lines (set_recipe)."),
        options: z.array(optionLine).optional().describe("Option-driven ingredient tweaks (set_recipe)."),
      },
    },
    (args) =>
      run(async () => {
        guardDestructive(config, args.action, DESTRUCTIVE);
        const a = args.action;
        switch (a) {
          case "list": {
            const branch = await client.branchId(args.branchId);
            const { data } = await client.request("GET", `/api/branches/${branch}/stock`);
            return ok(data);
          }
          case "create": {
            const branch = await client.branchId(args.branchId);
            const body = {
              name: args.name,
              nameEn: args.nameEn,
              nameAr: args.nameAr,
              unit: need(args.unit, "unit", a),
              quantity: args.quantity,
              reorderPoint: args.reorderPoint,
              unitPrice: args.unitPrice,
              packSize: args.packSize,
              packUnit: args.packUnit,
            };
            const { data, message } = await client.request("POST", `/api/branches/${branch}/stock`, { body });
            return ok(data, message);
          }
          case "update": {
            const id = need(args.itemId, "itemId", a);
            const body = {
              name: args.name,
              nameEn: args.nameEn,
              nameAr: args.nameAr,
              unit: need(args.unit, "unit", a),
              reorderPoint: args.reorderPoint,
              unitPrice: args.unitPrice,
              packSize: args.packSize,
              packUnit: args.packUnit,
            };
            const { data, message } = await client.request("PATCH", `/api/stock/${id}`, { body });
            return ok(data, message);
          }
          case "receive": {
            const id = need(args.itemId, "itemId", a);
            const body = { amount: need(args.amount, "amount", a), unitPrice: args.unitPrice };
            const { data, message } = await client.request("POST", `/api/stock/${id}/receive`, { body });
            return ok(data, message);
          }
          case "count": {
            const id = need(args.itemId, "itemId", a);
            const body = { quantity: need(args.quantity, "quantity", a) };
            const { data, message } = await client.request("POST", `/api/stock/${id}/count`, { body });
            return ok(data, message);
          }
          case "delete": {
            const id = need(args.itemId, "itemId", a);
            const { message } = await client.request("DELETE", `/api/stock/${id}`);
            return ok(null, message ?? "Stock item deleted.");
          }
          case "usage": {
            const branch = await client.branchId(args.branchId);
            const { data } = await client.request("GET", `/api/branches/${branch}/stock/usage`, {
              query: { days: args.days },
            });
            return ok(data);
          }
          case "rules": {
            const branch = await client.branchId(args.branchId);
            const { data } = await client.request("GET", `/api/branches/${branch}/menu-stock`);
            return ok(data);
          }
          case "set_rule": {
            const branch = await client.branchId(args.branchId);
            const menuItemId = need(args.menuItemId, "menuItemId", a);
            const { data, message } = await client.request(
              "PUT",
              `/api/branches/${branch}/menu-stock/${menuItemId}`,
              { body: { dailyLimit: args.dailyLimit } },
            );
            return ok(data, message);
          }
          case "recipes": {
            const branch = await client.branchId(args.branchId);
            const { data } = await client.request("GET", `/api/branches/${branch}/recipes`);
            return ok(data);
          }
          case "option_recipes": {
            const branch = await client.branchId(args.branchId);
            const { data } = await client.request("GET", `/api/branches/${branch}/recipes/options`);
            return ok(data);
          }
          case "set_recipe": {
            const branch = await client.branchId(args.branchId);
            const menuItemId = need(args.menuItemId, "menuItemId", a);
            const body = { lines: need(args.lines, "lines", a), options: args.options };
            const { data, message } = await client.request(
              "PUT",
              `/api/branches/${branch}/recipes/${menuItemId}`,
              { body },
            );
            return ok(data, message);
          }
          default:
            return ok(null, `Unknown action '${a}'.`);
        }
      }),
  );
}
