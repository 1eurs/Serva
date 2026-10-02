import type { Config } from "./config.js";
import type { ServaClient } from "./client.js";
import { ServaError } from "./client.js";

/** Shared handle passed to every domain's tool registrar. */
export interface Ctx {
  client: ServaClient;
  config: Config;
}

/** The MCP text result shape every tool returns. */
export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function serialize(data: unknown): string {
  if (data === undefined || data === null) return "(no data)";
  if (typeof data === "string") return data;
  return JSON.stringify(data, null, 2);
}

/** A successful result: an optional human note followed by the JSON payload. */
export function ok(data: unknown, message?: string): ToolResult {
  const body = serialize(data);
  const text =
    message && body !== "(no data)" ? `${message}\n\n${body}` : (message ?? body);
  return { content: [{ type: "text", text }] };
}

export function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

/** Wrap a handler so backend/validation errors come back as clean tool errors, never crashes. */
export async function run(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ServaError) {
      return fail(`${e.message}${e.errorCode ? ` [${e.errorCode}]` : ""}`);
    }
    return fail(e instanceof Error ? e.message : String(e));
  }
}

/** Raised when a destructive action is attempted while the gate is closed. */
export class Disabled extends Error {}

/** Throw unless the destructive gate is open. Actions listed in `destructive` are guarded. */
export function guardDestructive(
  config: Config,
  action: string,
  destructive: ReadonlySet<string>,
): void {
  if (destructive.has(action) && !config.allowDestructive) {
    throw new Disabled(
      `'${action}' is a destructive action and is disabled. ` +
        `Set SERVA_ALLOW_DESTRUCTIVE=1 on the MCP server to enable it.`,
    );
  }
}

/** Require a field that a given action needs, with a message the model can act on. */
export function need<T>(value: T | undefined | null, name: string, action: string): T {
  if (value === undefined || value === null) {
    throw new Error(`'${name}' is required for action '${action}'.`);
  }
  return value;
}
