#!/usr/bin/env node
import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./config.js";
import { ServaClient } from "./client.js";
import { buildServer } from "./server.js";

const KEY_PREFIX = "serva_sk_";

function bearerKey(req: Request): string | null {
  const header = req.header("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.startsWith(KEY_PREFIX) ? token : null;
}

function rpcError(res: Response, status: number, message: string): void {
  res.status(status).json({ jsonrpc: "2.0", error: { code: -32001, message }, id: null });
}

/**
 * Hosted, multi-tenant entry point. Each request carries its own API key in the Authorization
 * header; we build a fresh server + client scoped to that key and tear them down when the
 * response ends (the SDK's stateless pattern — no shared session, no cross-caller id collisions).
 * The process holds no key of its own; the backend authorises every forwarded call.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const app = express();
  app.use(express.json({ limit: "4mb" }));

  app.get("/healthz", (_req, res) => {
    res.status(200).send("ok");
  });

  app.post("/mcp", async (req: Request, res: Response) => {
    const key = bearerKey(req);
    if (!key) {
      rpcError(res, 401, "Missing or invalid API key. Send 'Authorization: Bearer serva_sk_...'.");
      return;
    }
    const client = new ServaClient({ ...config, apiKey: key });
    const server = buildServer({ client, config });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      console.error("[serva-mcp] request error:", e);
      if (!res.headersSent) rpcError(res, 500, "Internal error handling the MCP request.");
    }
  });

  // Stateless mode has no long-lived session for the client to GET a stream from or DELETE.
  const notAllowed = (_req: Request, res: Response) =>
    rpcError(res, 405, "Method not allowed; this endpoint is stateless — POST JSON-RPC to /mcp.");
  app.get("/mcp", notAllowed);
  app.delete("/mcp", notAllowed);

  app.listen(config.httpPort, () => {
    console.error(
      `[serva-mcp] HTTP (multi-tenant) on :${config.httpPort} → ${config.apiBase}; ` +
        `each request authenticates by its own serva_sk_ key`,
    );
  });
}

main().catch((e) => {
  console.error("[serva-mcp] fatal:", e);
  process.exit(1);
});
