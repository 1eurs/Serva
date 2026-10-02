import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type Ctx, ok, run, need } from "../util.js";

export function registerLoyalty(server: McpServer, { client }: Ctx): void {
  server.registerTool(
    "serva_loyalty",
    {
      title: "Loyalty program",
      description:
        "The stamp-card program: read and configure it (enable, stamps required, the free reward and eligible items, " +
        "minimum order, card styling), see per-branch activity over a time range, and list members.",
      inputSchema: {
        action: z.enum(["get_program", "update_program", "branch_activity", "members"]),
        // update_program fields:
        enabled: z.boolean().optional(),
        stampsRequired: z.number().int().optional(),
        rewardLabel: z.string().optional(),
        rewardItemIds: z.array(z.number()).optional().describe("Menu items eligible as the free reward."),
        minOrderAmount: z.number().optional(),
        cardColor: z.string().optional().describe("Accent hex #RRGGBB, or null to inherit."),
        cardBg: z.string().optional(),
        stampIcon: z.string().optional(),
        cardMotif: z.string().optional(),
        // branch_activity params:
        branchId: z.number().optional(),
        from: z.string().optional().describe("ISO-8601 instant (branch_activity)."),
        to: z.string().optional().describe("ISO-8601 instant (branch_activity)."),
      },
    },
    (args) =>
      run(async () => {
        const a = args.action;
        switch (a) {
          case "get_program": {
            const { data } = await client.request("GET", "/api/loyalty/program");
            return ok(data);
          }
          case "update_program": {
            const body = {
              enabled: args.enabled ?? false,
              stampsRequired: args.stampsRequired ?? 0,
              rewardLabel: args.rewardLabel,
              rewardItemIds: args.rewardItemIds,
              minOrderAmount: args.minOrderAmount,
              cardColor: args.cardColor,
              cardBg: args.cardBg,
              stampIcon: args.stampIcon,
              cardMotif: args.cardMotif,
            };
            const { data, message } = await client.request("PATCH", "/api/loyalty/program", { body });
            return ok(data, message);
          }
          case "branch_activity": {
            const { data } = await client.request("GET", "/api/loyalty/activity/by-branch", {
              query: {
                branchId: args.branchId,
                from: need(args.from, "from", a),
                to: need(args.to, "to", a),
              },
            });
            return ok(data);
          }
          case "members": {
            const { data } = await client.request("GET", "/api/loyalty/members");
            return ok(data);
          }
          default:
            return ok(null, `Unknown action '${a}'.`);
        }
      }),
  );
}
