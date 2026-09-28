#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { ServaClient } from "./client.js";
import { buildServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new ServaClient(config);
  const server = buildServer({ client, config });

  // Eagerly authenticate so credential problems surface at startup, not mid-task.
  try {
    await client.ensureAuth();
    const u = client.currentUser;
    console.error(
      `[serva-mcp] authenticated as ${u.username} via ${config.apiKey ? "API key" : "password"} ` +
        `(restaurant ${u.restaurantId ?? "—"}, branch ${u.branchId ?? "—"}); ` +
        `destructive ${config.allowDestructive ? "ENABLED" : "disabled"}`,
    );
  } catch (e) {
    console.error(
      `[serva-mcp] WARNING: initial login to ${config.apiBase} failed: ${(e as Error).message}. ` +
        `Tools will retry on first use.`,
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[serva-mcp] ready on stdio → ${config.apiBase}`);
}

main().catch((e) => {
  console.error("[serva-mcp] fatal:", e);
  process.exit(1);
});
