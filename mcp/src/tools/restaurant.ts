import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type Ctx, ok, run, need, guardDestructive } from "../util.js";

const DESTRUCTIVE = new Set(["branch_deactivate"]);

export function registerRestaurant(server: McpServer, { client, config }: Ctx): void {
  server.registerTool(
    "serva_restaurant",
    {
      title: "Restaurant profile, branches & plan",
      description:
        "The café itself: read/update the profile (name, contact, currency, VAT, order-pad and stock settings), the " +
        "menu look (theme, menu-info, receipt), the subscription and enabled features, and branches — list, read, " +
        "add, rename, activate/deactivate. Destructive (needs SERVA_ALLOW_DESTRUCTIVE=1): branch_deactivate.",
      inputSchema: {
        action: z.enum([
          "get",
          "update",
          "update_theme",
          "update_menu_info",
          "update_receipt",
          "subscription",
          "features",
          "branches",
          "branch_get",
          "branch_create",
          "branch_update",
          "branch_activate",
          "branch_deactivate",
        ]),
        restaurantId: z.number().optional().describe("Defaults to your account's restaurant."),
        branchId: z.number().optional().describe("Target branch for branch_* actions."),
        // Profile (update):
        name: z.string().optional(),
        nameEn: z.string().optional(),
        nameAr: z.string().optional(),
        logoUrl: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        instagramUrl: z.string().optional(),
        currency: z.string().optional(),
        vatEnabled: z.boolean().optional(),
        vatRate: z.number().optional(),
        paymentMethodSelectionEnabled: z.boolean().optional(),
        hideWhenOutOfStock: z.boolean().optional(),
        padAskName: z.boolean().optional(),
        padAskPhone: z.boolean().optional(),
        padAskPager: z.boolean().optional(),
        // Look:
        theme: z.string().optional().describe("Theme key (update_theme)."),
        themeCustomJson: z.string().optional().describe("Custom theme JSON string (update_theme)."),
        menuInfoJson: z.string().optional().describe("Menu-info JSON string (update_menu_info)."),
        receiptSettingsJson: z.string().optional().describe("Receipt-settings JSON string (update_receipt)."),
        // Branch create/update:
        address: z.string().optional(),
        openingHours: z.string().optional(),
        printerEnabled: z.boolean().optional(),
        counterMode: z.boolean().optional(),
      },
    },
    (args) =>
      run(async () => {
        guardDestructive(config, args.action, DESTRUCTIVE);
        const a = args.action;
        const rid = () => client.restaurantId(args.restaurantId);
        switch (a) {
          case "get":
            return ok((await client.request("GET", `/api/restaurants/${await rid()}`)).data);
          case "subscription":
            return ok((await client.request("GET", `/api/restaurants/${await rid()}/subscription`)).data);
          case "features":
            return ok((await client.request("GET", "/api/dashboard/features")).data);
          case "branches":
            return ok((await client.request("GET", `/api/restaurants/${await rid()}/branches`)).data);
          case "branch_get": {
            const id = need(args.branchId, "branchId", a);
            return ok((await client.request("GET", `/api/branches/${id}`)).data);
          }
          case "update": {
            const body = {
              name: args.name,
              nameEn: args.nameEn,
              nameAr: args.nameAr,
              logoUrl: args.logoUrl,
              phone: args.phone,
              email: args.email,
              instagramUrl: args.instagramUrl,
              currency: args.currency,
              vatEnabled: args.vatEnabled,
              vatRate: args.vatRate,
              paymentMethodSelectionEnabled: args.paymentMethodSelectionEnabled,
              hideWhenOutOfStock: args.hideWhenOutOfStock,
              padAskName: args.padAskName,
              padAskPhone: args.padAskPhone,
              padAskPager: args.padAskPager,
            };
            const { data, message } = await client.request("PATCH", `/api/restaurants/${await rid()}`, { body });
            return ok(data, message);
          }
          case "update_theme": {
            const body = { theme: args.theme, themeCustomJson: args.themeCustomJson };
            const { data, message } = await client.request("PATCH", `/api/restaurants/${await rid()}/theme`, { body });
            return ok(data, message);
          }
          case "update_menu_info": {
            const body = { menuInfoJson: need(args.menuInfoJson, "menuInfoJson", a) };
            const { data, message } = await client.request("PATCH", `/api/restaurants/${await rid()}/menu-info`, { body });
            return ok(data, message);
          }
          case "update_receipt": {
            const body = { receiptSettingsJson: need(args.receiptSettingsJson, "receiptSettingsJson", a) };
            const { data, message } = await client.request("PATCH", `/api/restaurants/${await rid()}/receipt`, { body });
            return ok(data, message);
          }
          case "branch_create": {
            const body = {
              name: args.name,
              nameEn: args.nameEn,
              nameAr: args.nameAr,
              address: args.address,
              phone: args.phone,
              openingHours: args.openingHours,
            };
            const { data, message } = await client.request("POST", `/api/restaurants/${await rid()}/branches`, { body });
            return ok(data, message);
          }
          case "branch_update": {
            const id = need(args.branchId, "branchId", a);
            const body = {
              name: args.name,
              nameEn: args.nameEn,
              nameAr: args.nameAr,
              address: args.address,
              phone: args.phone,
              openingHours: args.openingHours,
              printerEnabled: args.printerEnabled,
              counterMode: args.counterMode,
            };
            const { data, message } = await client.request("PATCH", `/api/branches/${id}`, { body });
            return ok(data, message);
          }
          case "branch_activate": {
            const id = need(args.branchId, "branchId", a);
            const { data, message } = await client.request("PATCH", `/api/branches/${id}/activate`);
            return ok(data, message);
          }
          case "branch_deactivate": {
            const id = need(args.branchId, "branchId", a);
            const { data, message } = await client.request("PATCH", `/api/branches/${id}/deactivate`);
            return ok(data, message);
          }
          default:
            return ok(null, `Unknown action '${a}'.`);
        }
      }),
  );
}
