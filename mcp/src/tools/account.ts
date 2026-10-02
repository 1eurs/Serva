import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type Ctx, ok, run, need, guardDestructive } from "../util.js";

const DESTRUCTIVE = new Set(["change_password", "change_email", "logout"]);

export function registerAccount(server: McpServer, { client, config }: Ctx): void {
  server.registerTool(
    "serva_account",
    {
      title: "Signed-in account",
      description:
        "Who the MCP is acting as: read the current user (permissions, restaurantId, branchId — useful for scoping " +
        "other calls) or update its own profile name/phone. Start here if you're unsure which café or branch is in " +
        "context. Account security — change_password, change_email, logout — is DESTRUCTIVE (needs " +
        "SERVA_ALLOW_DESTRUCTIVE=1): the MCP logs in with these very credentials, so changing them breaks its stored " +
        "login until SERVA_USERNAME/SERVA_PASSWORD are updated.",
      inputSchema: {
        action: z.enum(["me", "update_profile", "change_password", "change_email", "logout"]),
        fullName: z.string().optional(),
        fullNameEn: z.string().optional(),
        fullNameAr: z.string().optional(),
        phone: z.string().optional(),
        currentPassword: z.string().optional(),
        newPassword: z.string().optional(),
        newEmail: z.string().optional(),
      },
    },
    (args) =>
      run(async () => {
        guardDestructive(config, args.action, DESTRUCTIVE);
        const a = args.action;
        switch (a) {
          case "me":
            return ok((await client.request("GET", "/api/auth/me")).data);
          case "update_profile": {
            const body = {
              fullName: args.fullName,
              fullNameEn: args.fullNameEn,
              fullNameAr: args.fullNameAr,
              phone: args.phone,
            };
            const { data, message } = await client.request("PATCH", "/api/auth/me", { body });
            return ok(data, message);
          }
          case "change_password": {
            const body = {
              currentPassword: need(args.currentPassword, "currentPassword", a),
              newPassword: need(args.newPassword, "newPassword", a),
            };
            const { message } = await client.request("POST", "/api/auth/change-password", { body });
            return ok(
              null,
              `${message ?? "Password changed."} NOTE: update SERVA_PASSWORD on the MCP server or it can't log in again.`,
            );
          }
          case "change_email": {
            const body = {
              currentPassword: need(args.currentPassword, "currentPassword", a),
              newEmail: need(args.newEmail, "newEmail", a),
            };
            const { data, message } = await client.request("POST", "/api/auth/change-email", { body });
            return ok(
              data,
              `${message ?? "Email changed."} NOTE: update SERVA_USERNAME to the new email or the MCP can't log in again.`,
            );
          }
          case "logout": {
            const { message } = await client.request("POST", "/api/auth/logout");
            return ok(null, message ?? "Logged out (refresh tokens revoked).");
          }
          default:
            return ok(null, `Unknown action '${a}'.`);
        }
      }),
  );
}
