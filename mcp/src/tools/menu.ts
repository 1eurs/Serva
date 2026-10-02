import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type Ctx, ok, run, need, guardDestructive } from "../util.js";
import { DISCOUNT_TYPES } from "../enums.js";

const DESTRUCTIVE = new Set(["delete_category", "delete_item"]);

const optionInput = z.object({
  nameEn: z.string().optional(),
  nameAr: z.string().optional(),
  priceDelta: z.number().optional(),
  displayOrder: z.number().optional(),
});
const optionGroupInput = z.object({
  nameEn: z.string().optional(),
  nameAr: z.string().optional(),
  selectionType: z.enum(["SINGLE", "MULTI"]).optional(),
  required: z.boolean().optional(),
  displayOrder: z.number().optional(),
  options: z.array(optionInput).optional(),
});

export function registerMenu(server: McpServer, { client, config }: Ctx): void {
  server.registerTool(
    "serva_menu",
    {
      title: "Menu (categories & items)",
      description:
        "The customer-facing menu: categories and items, prices, discounts, photos, option groups (size/milk/extras), " +
        "and quick availability toggles. Destructive (needs SERVA_ALLOW_DESTRUCTIVE=1): delete_category, delete_item.",
      inputSchema: {
        action: z.enum([
          "list_categories",
          "create_category",
          "update_category",
          "delete_category",
          "list_items",
          "get_item",
          "create_item",
          "update_item",
          "set_availability",
          "delete_item",
        ]),
        id: z.number().optional().describe("Category id or item id, per action."),
        branchId: z.number().optional().describe("Branch scope / filter. Null = restaurant-wide."),
        categoryId: z.number().optional(),
        // Category fields:
        nameEn: z.string().optional(),
        nameAr: z.string().optional(),
        descriptionEn: z.string().optional(),
        descriptionAr: z.string().optional(),
        displayOrder: z.number().optional(),
        active: z.boolean().optional(),
        // Item fields:
        price: z.number().optional(),
        discountType: z.enum(DISCOUNT_TYPES).optional(),
        discountValue: z.number().optional(),
        discountStartsAt: z.string().optional().describe("ISO-8601 instant."),
        discountEndsAt: z.string().optional().describe("ISO-8601 instant."),
        imageUrl: z.string().optional(),
        imageUrls: z.array(z.string()).optional().describe("Photo gallery; first becomes the main image."),
        removeImage: z.boolean().optional().describe("update_item only: clear the image."),
        available: z.boolean().optional(),
        preparationTimeMinutes: z.number().optional(),
        optionGroups: z.array(optionGroupInput).optional().describe("Replaces all option groups when present."),
        comboItemIds: z
          .array(z.number())
          .optional()
          .describe(
            "Makes this item a combo that bundles these item ids (repeat an id for '2×'). " +
              "Empty array clears the bundle back to a plain item. Every part must be a plain " +
              "item of the same restaurant.",
          ),
      },
    },
    (args) =>
      run(async () => {
        guardDestructive(config, args.action, DESTRUCTIVE);
        const a = args.action;
        switch (a) {
          case "list_categories": {
            const { data } = await client.request("GET", "/api/menu/categories", {
              query: { branchId: args.branchId },
            });
            return ok(data);
          }
          case "create_category": {
            const body = {
              branchId: args.branchId,
              nameEn: args.nameEn,
              nameAr: args.nameAr,
              descriptionEn: args.descriptionEn,
              descriptionAr: args.descriptionAr,
              displayOrder: args.displayOrder,
              active: args.active,
            };
            const { data, message } = await client.request("POST", "/api/menu/categories", { body });
            return ok(data, message);
          }
          case "update_category": {
            const id = need(args.id, "id", a);
            const body = {
              nameEn: args.nameEn,
              nameAr: args.nameAr,
              descriptionEn: args.descriptionEn,
              descriptionAr: args.descriptionAr,
              displayOrder: args.displayOrder,
              active: args.active,
            };
            const { data, message } = await client.request("PATCH", `/api/menu/categories/${id}`, { body });
            return ok(data, message);
          }
          case "delete_category": {
            const id = need(args.id, "id", a);
            const { message } = await client.request("DELETE", `/api/menu/categories/${id}`);
            return ok(null, message ?? "Category deleted.");
          }
          case "list_items": {
            const { data } = await client.request("GET", "/api/menu/items", {
              query: { branchId: args.branchId, categoryId: args.categoryId },
            });
            return ok(data);
          }
          case "get_item": {
            const id = need(args.id, "id", a);
            const { data } = await client.request("GET", `/api/menu/items/${id}`);
            return ok(data);
          }
          case "create_item": {
            const body = itemBody(args);
            const { data, message } = await client.request("POST", "/api/menu/items", { body });
            return ok(data, message);
          }
          case "update_item": {
            const id = need(args.id, "id", a);
            const body = { ...itemBody(args), removeImage: args.removeImage };
            const { data, message } = await client.request("PATCH", `/api/menu/items/${id}`, { body });
            return ok(data, message);
          }
          case "set_availability": {
            const id = need(args.id, "id", a);
            const { data, message } = await client.request("PATCH", `/api/menu/items/${id}/availability`, {
              body: { available: need(args.available, "available", a) },
            });
            return ok(data, message);
          }
          case "delete_item": {
            const id = need(args.id, "id", a);
            const { message } = await client.request("DELETE", `/api/menu/items/${id}`);
            return ok(null, message ?? "Item deleted.");
          }
          default:
            return ok(null, `Unknown action '${a}'.`);
        }
      }),
  );
}

type ItemArgs = {
  branchId?: number;
  categoryId?: number;
  nameEn?: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  price?: number;
  discountType?: string;
  discountValue?: number;
  discountStartsAt?: string;
  discountEndsAt?: string;
  imageUrl?: string;
  imageUrls?: string[];
  available?: boolean;
  preparationTimeMinutes?: number;
  displayOrder?: number;
  optionGroups?: unknown[];
  comboItemIds?: number[];
};

function itemBody(args: ItemArgs): Record<string, unknown> {
  return {
    branchId: args.branchId,
    categoryId: args.categoryId,
    nameEn: args.nameEn,
    nameAr: args.nameAr,
    descriptionEn: args.descriptionEn,
    descriptionAr: args.descriptionAr,
    price: args.price,
    discountType: args.discountType,
    discountValue: args.discountValue,
    discountStartsAt: args.discountStartsAt,
    discountEndsAt: args.discountEndsAt,
    imageUrl: args.imageUrl,
    imageUrls: args.imageUrls,
    available: args.available,
    preparationTimeMinutes: args.preparationTimeMinutes,
    displayOrder: args.displayOrder,
    optionGroups: args.optionGroups,
    comboItemIds: args.comboItemIds,
  };
}
