import { z } from "zod";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type Ctx, ok, run } from "../util.js";

export function registerReports(server: McpServer, { client, config }: Ctx): void {
  server.registerTool(
    "serva_reports",
    {
      title: "Daily report (PDF)",
      description:
        "Generate the end-of-day report as a PDF and save it to disk (defaults to a temp dir; set SERVA_REPORT_DIR " +
        "to change it). Returns the saved file path. Optionally scope to a branch and/or a specific date.",
      inputSchema: {
        branchId: z.number().optional().describe("Branch scope. Omit for the whole restaurant."),
        date: z.string().optional().describe("Report date YYYY-MM-DD. Omit for today."),
      },
    },
    (args) =>
      run(async () => {
        const bytes = await client.requestBytes("GET", "/api/dashboard/reports/daily", {
          query: { branchId: args.branchId, date: args.date },
        });
        const stamp = (args.date ?? new Date().toISOString().slice(0, 10)).replace(/[^0-9-]/g, "");
        const suffix = args.branchId ? `-branch${args.branchId}` : "";
        const file = path.join(config.reportDir, `serva-daily-${stamp}${suffix}.pdf`);
        await writeFile(file, bytes);
        return ok({ path: file, bytes: bytes.length }, `Daily report saved (${bytes.length} bytes).`);
      }),
  );
}
