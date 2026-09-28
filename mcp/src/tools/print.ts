import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type Ctx, ok, run, need } from "../util.js";

export function registerPrint(server: McpServer, { client }: Ctx): void {
  server.registerTool(
    "serva_print",
    {
      title: "Print-station queue",
      description:
        "The receipt-printer queue a station polls. Mostly the station app's own job, exposed here for " +
        "completeness: list pending jobs, pull the next batch for a station, (re)enqueue an order's ticket, " +
        "read a station's status, and acknowledge a printed job. Branch defaults to your account's branch.",
      inputSchema: {
        action: z.enum(["pending", "pull", "enqueue", "station", "ack"]),
        branchId: z.number().optional(),
        stationId: z.string().optional().describe("Station identifier (pull)."),
        orderId: z.number().optional().describe("Order whose ticket to enqueue."),
        jobId: z.number().optional().describe("Print job to acknowledge."),
      },
    },
    (args) =>
      run(async () => {
        const a = args.action;
        switch (a) {
          case "pending": {
            const branch = await client.branchId(args.branchId);
            const { data } = await client.request("GET", "/api/dashboard/print-jobs", {
              query: { branchId: branch },
            });
            return ok(data);
          }
          case "pull": {
            const branch = await client.branchId(args.branchId);
            const { data, message } = await client.request("POST", "/api/dashboard/print-jobs/pull", {
              query: { branchId: branch, stationId: need(args.stationId, "stationId", a) },
            });
            return ok(data, message);
          }
          case "enqueue": {
            const { data, message } = await client.request("POST", "/api/dashboard/print-jobs", {
              query: { orderId: need(args.orderId, "orderId", a) },
            });
            return ok(data, message);
          }
          case "station": {
            const branch = await client.branchId(args.branchId);
            const { data } = await client.request("GET", "/api/dashboard/print-jobs/station", {
              query: { branchId: branch },
            });
            return ok(data);
          }
          case "ack": {
            const id = need(args.jobId, "jobId", a);
            const { message } = await client.request("POST", `/api/dashboard/print-jobs/${id}/ack`);
            return ok(null, message ?? "Acknowledged.");
          }
          default:
            return ok(null, `Unknown action '${a}'.`);
        }
      }),
  );
}
