import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type Ctx, ok, run, need, guardDestructive, Disabled } from "../util.js";
import { STAFF_PERMISSIONS } from "../enums.js";

const DESTRUCTIVE = new Set(["deactivate", "invite_revoke"]);

export function registerStaff(server: McpServer, { client, config }: Ctx): void {
  server.registerTool(
    "serva_staff",
    {
      title: "Staff & invites",
      description:
        "The team: list staff, create an account or send a join invite, edit a member's name/contact/permissions, " +
        "move them between branches, and activate them. Permissions are any of " +
        STAFF_PERMISSIONS.join(", ") +
        ". Destructive (needs SERVA_ALLOW_DESTRUCTIVE=1): deactivate, invite_revoke, and setting a staff password via update.",
      inputSchema: {
        action: z.enum([
          "list",
          "create",
          "update",
          "set_branch",
          "activate",
          "deactivate",
          "invite",
          "invites_list",
          "invite_resend",
          "invite_revoke",
        ]),
        userId: z.number().optional().describe("Target staff account (update/set_branch/activate/deactivate)."),
        inviteId: z.number().optional().describe("Target invite (invite_resend/invite_revoke)."),
        username: z.string().optional().describe("Login for create/invite."),
        password: z.string().optional().describe("Password for create, or to reset on update (gated)."),
        fullName: z.string().optional(),
        fullNameEn: z.string().optional(),
        fullNameAr: z.string().optional(),
        email: z.string().optional().describe("Only ever this account's own address, for password resets."),
        phone: z.string().optional(),
        permissions: z.array(z.enum(STAFF_PERMISSIONS)).optional(),
        branchId: z.number().optional().describe("Branch scope. Null = restaurant-wide (all branches)."),
      },
    },
    (args) =>
      run(async () => {
        guardDestructive(config, args.action, DESTRUCTIVE);
        const a = args.action;
        switch (a) {
          case "list": {
            const { data } = await client.request("GET", "/api/users", {
              query: { branchId: args.branchId },
            });
            return ok(data);
          }
          case "create": {
            const body = {
              username: need(args.username, "username", a),
              password: need(args.password, "password", a),
              fullName: args.fullName,
              fullNameEn: args.fullNameEn,
              fullNameAr: args.fullNameAr,
              email: args.email,
              phone: args.phone,
              permissions: args.permissions,
              branchId: args.branchId,
            };
            const { data, message } = await client.request("POST", "/api/users", { body });
            return ok(data, message);
          }
          case "update": {
            const id = need(args.userId, "userId", a);
            // Setting a password here is a reset — guard it like other destructive actions.
            if (args.password && !config.allowDestructive) {
              throw new Disabled(
                "Setting a staff password is disabled. Set SERVA_ALLOW_DESTRUCTIVE=1 to allow it.",
              );
            }
            const body = {
              fullName: args.fullName,
              fullNameEn: args.fullNameEn,
              fullNameAr: args.fullNameAr,
              email: args.email,
              phone: args.phone,
              password: args.password,
              permissions: args.permissions,
            };
            const { data, message } = await client.request("PATCH", `/api/users/${id}`, { body });
            return ok(data, message);
          }
          case "set_branch": {
            const id = need(args.userId, "userId", a);
            const { data, message } = await client.request("PATCH", `/api/users/${id}/branch`, {
              body: { branchId: args.branchId ?? null },
            });
            return ok(data, message);
          }
          case "activate": {
            const id = need(args.userId, "userId", a);
            const { data, message } = await client.request("PATCH", `/api/users/${id}/activate`);
            return ok(data, message);
          }
          case "deactivate": {
            const id = need(args.userId, "userId", a);
            const { data, message } = await client.request("PATCH", `/api/users/${id}/deactivate`);
            return ok(data, message);
          }
          case "invite": {
            const body = {
              username: need(args.username, "username", a),
              fullName: args.fullName,
              fullNameEn: args.fullNameEn,
              fullNameAr: args.fullNameAr,
              email: args.email,
              phone: args.phone,
              permissions: args.permissions,
              branchId: args.branchId,
            };
            const { data, message } = await client.request("POST", "/api/users/invites", { body });
            return ok(data, message);
          }
          case "invites_list": {
            const { data } = await client.request("GET", "/api/users/invites");
            return ok(data);
          }
          case "invite_resend": {
            const id = need(args.inviteId, "inviteId", a);
            const { data, message } = await client.request("POST", `/api/users/invites/${id}/resend`);
            return ok(data, message);
          }
          case "invite_revoke": {
            const id = need(args.inviteId, "inviteId", a);
            const { message } = await client.request("DELETE", `/api/users/invites/${id}`);
            return ok(null, message ?? "Invite revoked.");
          }
          default:
            return ok(null, `Unknown action '${a}'.`);
        }
      }),
  );
}
