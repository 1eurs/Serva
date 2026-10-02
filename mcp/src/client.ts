import type { Config } from "./config.js";

/** An error carrying the backend's message + errorCode from the response envelope. */
export class ServaError extends Error {
  readonly httpStatus: number;
  readonly errorCode?: string;
  constructor(message: string, httpStatus: number, errorCode?: string) {
    super(message);
    this.name = "ServaError";
    this.httpStatus = httpStatus;
    this.errorCode = errorCode;
  }
}

/** The subset of the login user we rely on to scope requests. */
export interface SessionUser {
  id: number;
  username: string;
  owner: boolean;
  permissions: string[];
  restaurantId: number | null;
  branchId: number | null;
  [k: string]: unknown;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

interface Envelope<T> {
  success: boolean;
  message?: string;
  data?: T;
  errorCode?: string;
}

export interface RequestOpts {
  query?: Record<string, unknown>;
  body?: unknown;
}

/**
 * Thin client over the Serva REST API. It logs in as the café owner, attaches the JWT,
 * and refreshes (or re-logs-in) once on a 401 — mirroring the dashboard's own api.ts. It
 * holds no business logic: whatever the owner's permissions allow, it allows.
 */
export class ServaClient {
  private access: string | null = null;
  private refresh: string | null = null;
  private user: SessionUser | null = null;
  private authLock: Promise<void> | null = null;
  /** When set, the MCP authenticates by this key instead of logging in. */
  private readonly apiKey: string | null;

  constructor(private readonly config: Config) {
    this.apiKey = config.apiKey ?? null;
  }

  /** The credential to send as the Bearer token: the API key, or the JWT from a password login. */
  private bearer(): string | null {
    return this.apiKey ?? this.access;
  }

  get currentUser(): SessionUser {
    if (!this.user) throw new Error("Not authenticated yet.");
    return this.user;
  }

  /** Resolve the restaurant id for restaurant-scoped calls. Authenticates first if needed. */
  async restaurantId(explicit?: number | null): Promise<number> {
    if (explicit != null) return explicit;
    await this.ensureAuth();
    const id = this.currentUser.restaurantId;
    if (id == null) {
      throw new Error("No restaurant in context; this account isn't tied to a café.");
    }
    return id;
  }

  /** Resolve the branch id for branch-scoped calls, with a message the model can act on. */
  async branchId(explicit?: number | null): Promise<number> {
    if (explicit != null) return explicit;
    await this.ensureAuth();
    const id = this.currentUser.branchId;
    if (id == null) {
      throw new Error(
        "This action needs a branchId, and your account isn't pinned to one branch. " +
          "Pass branchId explicitly — list branches with serva_restaurant action=branches.",
      );
    }
    return id;
  }

  async ensureAuth(): Promise<void> {
    // Key mode: the key is the credential; we only need to bootstrap the session user once
    // (for restaurantId/branchId resolution) from the existing /api/auth/me.
    if (this.apiKey) {
      if (this.user) return;
      if (!this.authLock) {
        this.authLock = this.loadMe().finally(() => {
          this.authLock = null;
        });
      }
      await this.authLock;
      return;
    }
    // Password mode: log in for a JWT.
    if (this.access) return;
    // Serialise concurrent logins so a burst of first calls doesn't log in many times.
    if (!this.authLock) {
      this.authLock = this.login().finally(() => {
        this.authLock = null;
      });
    }
    await this.authLock;
  }

  /** Key mode bootstrap: identify who the key is by reading /api/auth/me with it. */
  private async loadMe(): Promise<void> {
    const res = await fetch(`${this.config.apiBase}/api/auth/me`, {
      headers: { authorization: `Bearer ${this.apiKey}` },
    });
    const env = (await res.json().catch(() => null)) as Envelope<SessionUser> | null;
    if (!res.ok || !env?.success || !env.data) {
      throw new ServaError(env?.message ?? `API key rejected (${res.status})`, res.status, env?.errorCode);
    }
    this.user = env.data;
  }

  private async login(): Promise<void> {
    const res = await fetch(`${this.config.apiBase}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: this.config.username, password: this.config.password }),
    });
    const env = (await res.json().catch(() => null)) as Envelope<AuthResponse> | null;
    if (!res.ok || !env?.success || !env.data) {
      throw new ServaError(env?.message ?? `Login failed (${res.status})`, res.status, env?.errorCode);
    }
    this.applyAuth(env.data);
  }

  private applyAuth(a: AuthResponse): void {
    this.access = a.accessToken;
    this.refresh = a.refreshToken;
    this.user = a.user;
  }

  private async tryRefresh(): Promise<boolean> {
    if (!this.refresh) return false;
    try {
      const res = await fetch(`${this.config.apiBase}/api/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: this.refresh }),
      });
      const env = (await res.json().catch(() => null)) as Envelope<AuthResponse> | null;
      if (!res.ok || !env?.success || !env.data) return false;
      this.applyAuth(env.data);
      return true;
    } catch {
      return false;
    }
  }

  private buildUrl(path: string, query?: Record<string, unknown>): string {
    const u = new URL(this.config.apiBase + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
      }
    }
    return u.toString();
  }

  private async fetchOnce(method: string, path: string, opts: RequestOpts): Promise<Response> {
    const hasBody = opts.body !== undefined;
    return fetch(this.buildUrl(path, opts.query), {
      method,
      headers: {
        ...(hasBody ? { "content-type": "application/json" } : {}),
        ...(this.bearer() ? { authorization: `Bearer ${this.bearer()}` } : {}),
      },
      body: hasBody ? JSON.stringify(opts.body) : undefined,
    });
  }

  /** Run a request thunk, and on a 401 refresh (or re-login) once and retry it. */
  private async withAuthRetry(doFetch: () => Promise<Response>): Promise<Response> {
    await this.ensureAuth();
    let res = await doFetch();
    // Password mode: a lapsed access token gets one refresh (or fresh login) and a retry.
    // Key mode: a key doesn't lapse like that — a 401 means it was revoked or is wrong, so let
    // it surface instead of looping.
    if (res.status === 401 && !this.apiKey) {
      const refreshed = await this.tryRefresh();
      if (!refreshed) {
        this.access = null;
        await this.ensureAuth();
      }
      res = await doFetch();
    }
    return res;
  }

  private async raw(method: string, path: string, opts: RequestOpts): Promise<Response> {
    return this.withAuthRetry(() => this.fetchOnce(method, path, opts));
  }

  private async parseEnvelope<T>(res: Response): Promise<{ data: T; message?: string }> {
    const text = await res.text();
    let env: Envelope<T> | null = null;
    try {
      env = text ? (JSON.parse(text) as Envelope<T>) : null;
    } catch {
      /* non-JSON body — handled below */
    }
    if (!res.ok || (env && env.success === false)) {
      throw new ServaError(
        env?.message ?? `Request failed (${res.status})`,
        res.status,
        env?.errorCode,
      );
    }
    if (env && "success" in env) return { data: env.data as T, message: env.message };
    return { data: text as unknown as T };
  }

  /** Call an endpoint that returns the standard `{ success, message, data }` envelope. */
  async request<T = unknown>(
    method: string,
    path: string,
    opts: RequestOpts = {},
  ): Promise<{ data: T; message?: string }> {
    return this.parseEnvelope<T>(await this.raw(method, path, opts));
  }

  /** POST a multipart form (file upload); fetch sets the multipart boundary itself. */
  async requestForm<T = unknown>(
    method: string,
    path: string,
    form: FormData,
  ): Promise<{ data: T; message?: string }> {
    const res = await this.withAuthRetry(() =>
      fetch(this.buildUrl(path), {
        method,
        headers: { ...(this.bearer() ? { authorization: `Bearer ${this.bearer()}` } : {}) },
        body: form,
      }),
    );
    return this.parseEnvelope<T>(res);
  }

  /** Call an endpoint that returns raw bytes (e.g. a PDF). */
  async requestBytes(method: string, path: string, opts: RequestOpts = {}): Promise<Buffer> {
    const res = await this.raw(method, path, opts);
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new ServaError(
        `Request failed (${res.status})${t ? `: ${t.slice(0, 200)}` : ""}`,
        res.status,
      );
    }
    return Buffer.from(await res.arrayBuffer());
  }
}
