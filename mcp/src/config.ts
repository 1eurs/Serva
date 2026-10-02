import os from "node:os";

/** Everything the server needs to run, read once from the environment at startup. */
export interface Config {
  /** Base URL of the Serva backend, no trailing slash. */
  apiBase: string;
  /** Preferred auth: a scoped, revocable API key. When set, username/password are ignored. */
  apiKey?: string;
  /** Fallback auth: the café owner's login. The MCP acts as this account. */
  username?: string;
  password?: string;
  /** When false, destructive/irreversible tool actions refuse to run. */
  allowDestructive: boolean;
  /** Directory the daily-report PDF is written to. */
  reportDir: string;
  /** Hosted mode: serve over HTTP and take each caller's key from the request header. */
  http: boolean;
  httpPort: number;
}

export function loadConfig(): Config {
  const apiBase = (process.env.SERVA_API_BASE ?? "http://localhost:8080").replace(/\/+$/, "");
  const http = /^(1|true|yes|on)$/i.test(process.env.MCP_HTTP ?? "");
  const httpPort = Number(process.env.MCP_HTTP_PORT ?? "3000");
  const apiKey = process.env.SERVA_API_KEY?.trim() || undefined;
  // The dashboard logs in by username; owners commonly use their email as the username.
  const username = (process.env.SERVA_USERNAME ?? process.env.SERVA_EMAIL ?? "").trim();
  const password = process.env.SERVA_PASSWORD ?? "";
  // In HTTP mode the key arrives per-request in the Authorization header, so the server
  // itself needs no credential. In stdio mode it must have one.
  if (!http && !apiKey && !(username && password)) {
    throw new Error(
      "Authenticate the MCP with either SERVA_API_KEY (preferred — a scoped, revocable key minted " +
        "from /api/dashboard/api-keys), or SERVA_USERNAME + SERVA_PASSWORD (the owner's login).",
    );
  }
  const allowDestructive = /^(1|true|yes|on)$/i.test(process.env.SERVA_ALLOW_DESTRUCTIVE ?? "");
  const reportDir = process.env.SERVA_REPORT_DIR ?? os.tmpdir();
  return {
    apiBase,
    apiKey,
    username: username || undefined,
    password: password || undefined,
    allowDestructive,
    reportDir,
    http,
    httpPort,
  };
}
