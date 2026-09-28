import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Ctx } from "../util.js";
import { registerAccount } from "./account.js";
import { registerOrders } from "./orders.js";
import { registerMenu } from "./menu.js";
import { registerStock } from "./stock.js";
import { registerTill } from "./till.js";
import { registerAnalytics } from "./analytics.js";
import { registerTables } from "./tables.js";
import { registerStaff } from "./staff.js";
import { registerLoyalty } from "./loyalty.js";
import { registerCoupons } from "./coupons.js";
import { registerCustomers } from "./customers.js";
import { registerRestaurant } from "./restaurant.js";
import { registerReports } from "./reports.js";
import { registerUploads } from "./uploads.js";
import { registerPrint } from "./print.js";

/** Register every domain tool. One tool per business area an owner works in. */
export function registerAllTools(server: McpServer, ctx: Ctx): void {
  registerAccount(server, ctx);
  registerOrders(server, ctx);
  registerMenu(server, ctx);
  registerStock(server, ctx);
  registerTill(server, ctx);
  registerAnalytics(server, ctx);
  registerTables(server, ctx);
  registerStaff(server, ctx);
  registerLoyalty(server, ctx);
  registerCoupons(server, ctx);
  registerCustomers(server, ctx);
  registerRestaurant(server, ctx);
  registerReports(server, ctx);
  registerUploads(server, ctx);
  registerPrint(server, ctx);
}
