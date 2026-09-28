import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type Ctx, ok, run, need, guardDestructive } from "../util.js";
import { ORDER_STATUSES, ORDER_TYPES, PAYMENT_METHODS } from "../enums.js";

const DESTRUCTIVE = new Set(["cancel", "mark_failed"]);

const orderItem = z.object({
  menuItemId: z.number(),
  quantity: z.number().int().positive(),
  note: z.string().optional(),
  selectedOptions: z
    .array(z.object({ optionGroupId: z.number(), optionId: z.number() }))
    .optional(),
});

const tender = z.object({ method: z.enum(PAYMENT_METHODS), amount: z.number() });

export function registerOrders(server: McpServer, { client, config }: Ctx): void {
  server.registerTool(
    "serva_orders",
    {
      title: "Orders & payments",
      description:
        "The live board and every order action a café runs: browse and read orders, take a counter order, " +
        "advance one through accept → ready → complete, decline it, and settle payment (mark paid, split cash/card). " +
        "Also live QR-scan activity. Destructive (needs SERVA_ALLOW_DESTRUCTIVE=1): cancel, mark_failed.",
      inputSchema: {
        action: z
          .enum([
            "list",
            "get",
            "live",
            "qr_activity",
            "create",
            "accept",
            "decline",
            "ready",
            "complete",
            "cancel",
            "mark_paid",
            "split",
            "mark_failed",
          ])
          .describe("What to do."),
        orderId: z.number().optional().describe("Target order (get/accept/decline/ready/complete/cancel/mark_paid/split/mark_failed)."),
        branchId: z.number().optional().describe("Branch scope for list/live/create/qr_activity. Defaults to your account's branch."),
        status: z.enum(ORDER_STATUSES).optional().describe("Filter for list."),
        page: z.number().int().optional(),
        size: z.number().int().optional(),
        reason: z.string().optional().describe("Reason for decline/cancel."),
        prepTimeMinutes: z.number().int().optional().describe("Prep estimate when accepting."),
        method: z.enum(PAYMENT_METHODS).optional().describe("Payment method for mark_paid."),
        tenders: z.array(tender).optional().describe("Split settlement, e.g. [{method:'CASH',amount:2},{method:'CARD',amount:3}]."),
        // Fields for create (a staff/counter order):
        orderType: z.enum(ORDER_TYPES).optional(),
        tableId: z.number().optional().describe("Table for a DINE_IN order."),
        customerName: z.string().optional(),
        customerPhone: z.string().optional(),
        pagerNumber: z.string().optional(),
        carPlate: z.string().optional().describe("Required for CAR orders."),
        carColor: z.string().optional(),
        customerNote: z.string().optional(),
        couponCode: z.string().optional(),
        items: z.array(orderItem).optional().describe("Line items for create."),
        paid: z.boolean().optional().describe("Record payment in the same call (counter flow)."),
        paymentMethod: z.enum(PAYMENT_METHODS).optional(),
      },
    },
    (args) =>
      run(async () => {
        guardDestructive(config, args.action, DESTRUCTIVE);
        const a = args.action;
        switch (a) {
          case "list": {
            const { data } = await client.request("GET", "/api/dashboard/orders", {
              query: { status: args.status, branchId: args.branchId, page: args.page, size: args.size },
            });
            return ok(data);
          }
          case "live": {
            const { data } = await client.request("GET", "/api/dashboard/orders/live", {
              query: { branchId: args.branchId },
            });
            return ok(data);
          }
          case "qr_activity": {
            const { data } = await client.request("GET", "/api/dashboard/qr-activity", {
              query: { branchId: args.branchId },
            });
            return ok(data);
          }
          case "get": {
            const id = need(args.orderId, "orderId", a);
            const { data } = await client.request("GET", `/api/dashboard/orders/${id}`);
            return ok(data);
          }
          case "create": {
            const body = {
              branchId: args.branchId,
              orderType: args.orderType,
              tableId: args.tableId,
              customerName: args.customerName,
              customerPhone: args.customerPhone,
              pagerNumber: args.pagerNumber,
              carPlate: args.carPlate,
              carColor: args.carColor,
              customerNote: args.customerNote,
              couponCode: args.couponCode,
              items: need(args.items, "items", a),
              paid: args.paid,
              paymentMethod: args.paymentMethod,
              tenders: args.tenders,
            };
            const { data, message } = await client.request("POST", "/api/dashboard/orders", { body });
            return ok(data, message);
          }
          case "accept": {
            const id = need(args.orderId, "orderId", a);
            const { data, message } = await client.request("PATCH", `/api/dashboard/orders/${id}/accept`, {
              body: { prepTimeMinutes: args.prepTimeMinutes },
            });
            return ok(data, message);
          }
          case "decline": {
            const id = need(args.orderId, "orderId", a);
            const { data, message } = await client.request("PATCH", `/api/dashboard/orders/${id}/decline`, {
              body: { reason: args.reason },
            });
            return ok(data, message);
          }
          case "ready": {
            const id = need(args.orderId, "orderId", a);
            const { data, message } = await client.request("PATCH", `/api/dashboard/orders/${id}/ready`);
            return ok(data, message);
          }
          case "complete": {
            const id = need(args.orderId, "orderId", a);
            const { data, message } = await client.request("PATCH", `/api/dashboard/orders/${id}/complete`);
            return ok(data, message);
          }
          case "cancel": {
            const id = need(args.orderId, "orderId", a);
            const { data, message } = await client.request("PATCH", `/api/dashboard/orders/${id}/cancel`, {
              body: { reason: args.reason },
            });
            return ok(data, message);
          }
          case "mark_paid": {
            const id = need(args.orderId, "orderId", a);
            const { data, message } = await client.request("POST", `/api/payments/orders/${id}/mark-paid`, {
              body: { method: args.method ?? "CARD" },
            });
            return ok(data, message);
          }
          case "split": {
            const id = need(args.orderId, "orderId", a);
            const { data, message } = await client.request("POST", `/api/payments/orders/${id}/split`, {
              body: { tenders: need(args.tenders, "tenders", a) },
            });
            return ok(data, message);
          }
          case "mark_failed": {
            const id = need(args.orderId, "orderId", a);
            const { data, message } = await client.request("POST", `/api/payments/orders/${id}/mark-failed`);
            return ok(data, message);
          }
          default:
            return ok(null, `Unknown action '${a}'.`);
        }
      }),
  );
}
