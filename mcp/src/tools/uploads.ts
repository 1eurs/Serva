import { z } from "zod";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type Ctx, ok, run } from "../util.js";

export function registerUploads(server: McpServer, { client }: Ctx): void {
  server.registerTool(
    "serva_uploads",
    {
      title: "Image uploads",
      description:
        "Upload an image from a local file and get back a hosted URL — then drop it into serva_menu " +
        "(create_item/update_item as imageUrl or imageUrls) or serva_restaurant (update logoUrl).",
      inputSchema: {
        action: z.enum(["upload_menu_image", "upload_logo"]),
        filePath: z.string().describe("Absolute path to a local image file (png/jpg/webp)."),
      },
    },
    (args) =>
      run(async () => {
        const bytes = await readFile(args.filePath);
        const form = new FormData();
        form.append("file", new Blob([bytes]), basename(args.filePath));
        const path =
          args.action === "upload_logo"
            ? "/api/uploads/restaurants/logo"
            : "/api/uploads/menu-items";
        const { data, message } = await client.requestForm("POST", path, form);
        return ok(data, message ?? "Uploaded.");
      }),
  );
}
