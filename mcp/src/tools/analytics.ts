import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type Ctx, ok, run, need } from "../util.js";

// action -> [path, whether it needs from/to]. All are GET and read-only.
const RANGE = true;
const ENDPOINTS: Record<string, { path: string; range: boolean }> = {
  today: { path: "/api/dashboard/analytics/today", range: false },
  orders: { path: "/api/dashboard/analytics/orders", range: RANGE },
  best_selling: { path: "/api/dashboard/analytics/best-selling-items", range: RANGE },
  daily: { path: "/api/dashboard/analytics/daily", range: RANGE },
  daypart: { path: "/api/dashboard/analytics/daypart", range: RANGE },
  payment_methods: { path: "/api/dashboard/analytics/payment-methods", range: RANGE },
  item_conversion: { path: "/api/dashboard/analytics/pro/item-conversion", range: RANGE },
  market_basket: { path: "/api/dashboard/analytics/pro/market-basket", range: RANGE },
  staff: { path: "/api/dashboard/analytics/pro/staff", range: RANGE },
  funnel: { path: "/api/dashboard/analytics/pro/funnel", range: RANGE },
  kitchen_timing: { path: "/api/dashboard/analytics/pro/kitchen-timing", range: RANGE },
  forecast: { path: "/api/dashboard/analytics/pro/forecast", range: false },
  customers: { path: "/api/dashboard/analytics/pro/customers", range: false },
  customer_base: { path: "/api/dashboard/analytics/pro/customer-base", range: false },
  customer_directory: { path: "/api/dashboard/analytics/pro/customer-directory", range: false },
  benchmark: { path: "/api/dashboard/analytics/pro/benchmark", range: false },
};

export function registerAnalytics(server: McpServer, { client }: Ctx): void {
  server.registerTool(
    "serva_analytics",
    {
      title: "Analytics & insights",
      description:
        "Every dashboard insight, read-only: today's snapshot, revenue/orders over a date range, best-sellers, " +
        "daily and by-daypart trends, payment-method split, and the Pro set — item conversion, market basket, staff " +
        "performance, order funnel, kitchen timing, demand forecast, customer insights/base/directory, and benchmark. " +
        "Date-range actions need from and to (YYYY-MM-DD).",
      inputSchema: {
        action: z.enum(Object.keys(ENDPOINTS) as [string, ...string[]]),
        from: z.string().optional().describe("Start date YYYY-MM-DD (range actions)."),
        to: z.string().optional().describe("End date YYYY-MM-DD (range actions)."),
        branchId: z.number().optional().describe("Branch scope. Omit for all branches."),
        limit: z.number().int().optional().describe("best_selling / market_basket top-N (default 10)."),
        weeks: z.number().int().optional().describe("forecast horizon in weeks (default 4)."),
        search: z.string().optional().describe("customer_directory name/phone filter."),
        page: z.number().int().optional().describe("customer_directory page (default 0)."),
        size: z.number().int().optional().describe("customer_directory page size (default 50)."),
      },
    },
    (args) =>
      run(async () => {
        const spec = ENDPOINTS[args.action];
        if (!spec) return ok(null, `Unknown action '${args.action}'.`);
        const query: Record<string, unknown> = { branchId: args.branchId };
        if (spec.range) {
          query.from = need(args.from, "from", args.action);
          query.to = need(args.to, "to", args.action);
        }
        if (args.limit !== undefined) query.limit = args.limit;
        if (args.weeks !== undefined) query.weeks = args.weeks;
        if (args.search !== undefined) query.search = args.search;
        if (args.page !== undefined) query.page = args.page;
        if (args.size !== undefined) query.size = args.size;
        const { data } = await client.request("GET", spec.path, { query });
        return ok(data);
      }),
  );
}
