/**
 * Load test against the LIVE Spring backend (:8080), not the Vite mock.
 *
 * Walks the same path a busy café does: public menu, presence heartbeats, QR
 * orders, customer tracking SSE, kitchen dashboard SSE + live board, staff
 * order pad, print-station pull, stock caps, and extra tenants.
 *
 * Requires seeded demo data (`npm run seed`) and the till open.
 *
 *   npm run loadtest              # every scenario
 *   npm run loadtest:quick        # shorter timings
 *   npm run loadtest:staging      # https://staging.serva.om (seed first)
 *   node scripts/load-test.mjs rush
 *   node scripts/load-test.mjs soak|backlog|stock|ceiling|tenants
 *
 * Production (https://serva.om) is refused unless LOADTEST_PROD=1, and even then
 * stock/ceiling/tenants/all are refused — those mutate settings or can stall the box.
 *
 * Env: API_BASE, CUSTOMERS, DURATION_S, TABLES, TENANTS, STOCK_CAP, CEILING_VUS, QUICK=1
 */
const BASE = process.env.API_BASE || 'http://localhost:8080';
const SLUG = process.env.SLUG || 'mutrah-coffee';
const OWNER = {
  username: process.env.OWNER_EMAIL || 'owner@mutrah.coffee',
  password: process.env.OWNER_PASSWORD || 'Owner123!',
};
const ADMIN = {
  username: process.env.ADMIN_EMAIL || 'admin@cafeqr.local',
  password: process.env.ADMIN_PASSWORD || 'Admin123!',
};

const QUICK = process.env.QUICK === '1' || process.argv.includes('--quick');
const n = (k, d) => {
  const v = Number(process.env[k]);
  return Number.isFinite(v) && v > 0 ? v : d;
};
const CFG = {
  customers: n('CUSTOMERS', QUICK ? 12 : 24),
  rushS: n('DURATION_S', QUICK ? 20 : 45),
  soakS: n('SOAK_S', QUICK ? 8 : 20),
  soakStreams: n('SOAK_STREAMS', QUICK ? 10 : 24),
  tables: n('TABLES', 16),
  backlogN: n('BACKLOG_N', QUICK ? 16 : 40),
  stockCap: n('STOCK_CAP', QUICK ? 8 : 12),
  stockBurst: n('STOCK_BURST', QUICK ? 20 : 40),
  ceilingVus: n('CEILING_VUS', QUICK ? 16 : 32),
  ceilingS: n('CEILING_S', QUICK ? 8 : 15),
  tenants: n('TENANTS', QUICK ? 1 : 2),
  tenantCustomers: n('TENANT_CUSTOMERS', QUICK ? 6 : 10),
  tenantS: n('TENANT_S', QUICK ? 12 : 20),
  kitchenMs: n('KITCHEN_MS', 350),
  dashboards: n('DASHBOARDS', 3),
};

const SCENARIOS = ['all', 'rush', 'soak', 'backlog', 'stock', 'ceiling', 'tenants'];
const arg = process.argv.slice(2).find((a) => !a.startsWith('-')) || 'all';
if (!SCENARIOS.includes(arg)) {
  console.error('Unknown scenario. Use: ' + SCENARIOS.join(' | '));
  process.exit(2);
}

{
  let host = '';
  try { host = new URL(BASE).hostname.toLowerCase(); } catch { /* keep empty */ }
  const prod = host === 'serva.om' || host === 'www.serva.om';
  const unsafe = new Set(['all', 'stock', 'ceiling', 'tenants']);
  if (prod && process.env.LOADTEST_PROD !== '1') {
    console.error(`Refusing ${BASE}.
This script writes orders, tables, till/printer flags and (for some scenarios) stock caps
and extra cafés. Mutrah Coffee is a live restaurant on serva.om.

Use staging:
  API_BASE=https://staging.serva.om npm run seed
  npm run loadtest:staging

To override anyway: LOADTEST_PROD=1 plus an explicit SLUG and OWNER_EMAIL.
stock / ceiling / tenants / all stay blocked on production.`);
    process.exit(2);
  }
  if (prod) {
    if (!process.env.SLUG || !process.env.OWNER_EMAIL) {
      console.error('Production load test needs SLUG and OWNER_EMAIL set explicitly — will not default to mutrah-coffee.');
      process.exit(2);
    }
    if (unsafe.has(arg) && process.env.LOADTEST_PROD_UNSAFE !== '1') {
      console.error(`Refusing scenario '${arg}' against production.
stock flips counter mode and a daily cap; ceiling can exhaust the 10-connection pool
for every café on the box; tenants onboard extra restaurants; all includes those.

Allowed: rush | soak | backlog
Override: LOADTEST_PROD_UNSAFE=1`);
      process.exit(2);
    }
    console.warn('WARNING: writing to production ' + BASE + ' café ' + SLUG);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const nowMs = () => performance.now();
const pct = (n, d) => (d ? ((100 * n) / d).toFixed(1) + '%' : '—');

function jwtExp(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return typeof payload.exp === 'number' ? payload.exp : 0;
  } catch {
    return 0;
  }
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

function fmtMs(ms) {
  if (!Number.isFinite(ms)) return '—';
  return ms < 10 ? ms.toFixed(1) : String(Math.round(ms));
}

// --------------------------------------------------------------------------- stats
const stats = {
  ops: new Map(),
  errors: new Map(),
  daily: new Map(),
  dailyDup: 0,
  sseOpen: 0,
  ssePeak: 0,
  sseEvents: 0,
  sseErrors: 0,
  livePeak: 0,
  stockOk: 0,
  stockSoldOut: 0,
  startedAt: Date.now(),
};

function op(name) {
  let s = stats.ops.get(name);
  if (!s) {
    s = { ok: 0, fail: 0, times: [] };
    stats.ops.set(name, s);
  }
  return s;
}

function record(name, { ok, ms, code, status }) {
  const s = op(name);
  if (ok) s.ok++;
  else {
    s.fail++;
    const key = `${name} ${code || status || 'ERR'}`;
    stats.errors.set(key, (stats.errors.get(key) || 0) + 1);
  }
  if (Number.isFinite(ms)) s.times.push(ms);
}

function noteDaily(branchId, dailyNumber) {
  if (dailyNumber == null) return;
  let set = stats.daily.get(branchId);
  if (!set) {
    set = new Set();
    stats.daily.set(branchId, set);
  }
  if (set.has(dailyNumber)) stats.dailyDup++;
  else set.add(dailyNumber);
}

// --------------------------------------------------------------------------- http
class Session {
  constructor(creds) {
    this.creds = creds;
    this.access = null;
    this.refresh = null;
    this.refreshing = null;
  }
  headers() {
    return this.access ? { Authorization: 'Bearer ' + this.access } : {};
  }
  async login() {
    const r = await call('/api/auth/login', { method: 'POST', body: this.creds, auth: false, op: 'auth.login' });
    if (!r.ok || !r.data?.accessToken) {
      throw new Error(
        `Login failed for ${this.creds.username} (${r.code || r.status}): ${r.message || 'no access token'}. `
        + `Is the Spring backend running on ${BASE}?`,
      );
    }
    this.access = r.data.accessToken;
    this.refresh = r.data.refreshToken;
    return r.data.user;
  }
  async ensure() {
    if (!this.access || jwtExp(this.access) - Date.now() / 1000 > 90) return;
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const r = await call('/api/auth/refresh', {
        method: 'POST',
        body: { refreshToken: this.refresh },
        auth: false,
        op: 'auth.refresh',
      });
      if (r.ok && r.data?.accessToken) {
        this.access = r.data.accessToken;
        this.refresh = r.data.refreshToken || this.refresh;
      } else {
        await this.login();
      }
    })().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }
}

async function call(path, { method = 'GET', body, auth = true, session, op: opName, timeoutMs = 30_000 } = {}) {
  const name = opName || `${method} ${path.split('?')[0]}`;
  if (auth && session) await session.ensure();
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  const t0 = nowMs();
  let status = 0;
  let env = {};
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(auth && session ? session.headers() : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ac.signal,
    });
    status = res.status;
    try { env = await res.json(); } catch { env = {}; }
    const ms = nowMs() - t0;
    const ok = res.ok && env.success !== false;
    record(name, { ok, ms, code: env.errorCode, status });
    return { ok, status, ms, data: env.data, code: env.errorCode, message: env.message, env };
  } catch (e) {
    const ms = nowMs() - t0;
    const code = e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK';
    record(name, { ok: false, ms, code, status });
    return { ok: false, status, ms, data: null, code, message: e.message, env };
  } finally {
    clearTimeout(t);
  }
}

// --------------------------------------------------------------------------- SSE
const openStreams = new Set();

function parseSseChunk(buf, onEvent) {
  let rest = buf;
  let idx;
  while ((idx = rest.indexOf('\n\n')) >= 0) {
    const block = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    let event = 'message';
    const dataLines = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      else if (line.startsWith(':')) continue;
    }
    if (event === 'message' && !dataLines.length) continue;
    let data = dataLines.join('\n');
    try { data = data ? JSON.parse(data) : null; } catch { /* keep string */ }
    stats.sseEvents++;
    onEvent?.(event, data);
  }
  return rest;
}

async function openSse(path, { session, onEvent, label } = {}) {
  if (session) await session.ensure();
  const t0 = nowMs();
  const ac = new AbortController();
  let res;
  try {
    res = await fetch(BASE + path, {
      headers: session ? session.headers() : {},
      signal: ac.signal,
    });
  } catch (e) {
    stats.sseErrors++;
    record(label || 'sse.open', { ok: false, ms: nowMs() - t0, code: 'NETWORK' });
    return { close() {}, opened: false };
  }
  const ms = nowMs() - t0;
  if (!res.ok || !res.body) {
    stats.sseErrors++;
    record(label || 'sse.open', { ok: false, ms, status: res.status, code: 'HTTP_' + res.status });
    return { close() {}, opened: false };
  }
  record(label || 'sse.open', { ok: true, ms });
  stats.sseOpen++;
  stats.ssePeak = Math.max(stats.ssePeak, stats.sseOpen);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const run = (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf = parseSseChunk(buf + decoder.decode(value, { stream: true }), onEvent);
      }
    } catch {
      stats.sseErrors++;
    } finally {
      stats.sseOpen = Math.max(0, stats.sseOpen - 1);
      openStreams.delete(handle);
    }
  })();

  const handle = {
    opened: true,
    close() { ac.abort(); reader.cancel().catch(() => {}); },
    done: run,
  };
  openStreams.add(handle);
  return handle;
}

function closeAllStreams() {
  for (const s of openStreams) s.close();
  openStreams.clear();
}

// --------------------------------------------------------------------------- café setup
function availableItems(menu) {
  const out = [];
  for (const c of menu?.categories || []) {
    for (const it of c.items || []) {
      if (it.available !== false && !it.soldOut) out.push(it);
    }
  }
  return out;
}

function orderLine(item, qty = 1) {
  const selectedOptions = [];
  for (const g of item.optionGroups || []) {
    if (g.required && g.options?.[0]) {
      selectedOptions.push({ optionGroupId: g.id, optionId: g.options[0].id });
    }
  }
  const line = { menuItemId: item.id, quantity: qty };
  if (selectedOptions.length) line.selectedOptions = selectedOptions;
  return line;
}

function cartLines(items, nLines = 1) {
  const lines = [];
  for (let i = 0; i < nLines && items.length; i++) {
    lines.push(orderLine(pick(items), randInt(1, 2)));
  }
  return lines.length ? lines : [orderLine(items[0])];
}

async function listAs(session, path) {
  const r = await call(path, { session });
  const d = r.data;
  if (Array.isArray(d)) return d;
  if (d?.content) return d.content;
  return [];
}

async function ensureTillOpen(session, branchId) {
  const st = await call(`/api/branches/${branchId}/till`, { session, op: 'till.state' });
  // Staging/prod may be a build from before the till existed — orders then have no drawer gate.
  if (st.status === 404 || st.code === 'NOT_FOUND') return;
  if (st.data?.open || st.data?.tillEnabled === false) return;
  const opened = await call(`/api/branches/${branchId}/till/open`, {
    method: 'POST',
    session,
    body: { openingFloat: 20.000 },
    op: 'till.open',
  });
  if (!opened.ok && opened.code !== 'CONFLICT' && opened.status !== 409) {
    throw new Error('Could not open till: ' + (opened.code || opened.message));
  }
}

async function ensureAccepting(session, branchId, branch) {
  if (branch?.acceptingOrders) return;
  await call(`/api/branches/${branchId}/ordering-status`, {
    method: 'PATCH',
    session,
    body: { acceptingOrders: true },
    op: 'branch.resume',
  });
}

async function ensureTables(session, branchId, want) {
  let tables = await listAs(session, `/api/branches/${branchId}/tables`);
  tables = tables.filter((t) => t.active !== false && t.qrCodeToken);
  let n = tables.filter((t) => String(t.tableNumber || '').startsWith('LT-')).length;
  while (tables.length < want) {
    n++;
    const created = await call(`/api/branches/${branchId}/tables`, {
      method: 'POST',
      session,
      body: { tableNumber: 'LT-' + n },
      op: 'table.create',
    });
    if (!created.ok) break;
    tables.push(created.data);
  }
  return tables.filter((t) => t.qrCodeToken);
}

async function ensurePrinter(session, branchId, on) {
  await call(`/api/branches/${branchId}`, {
    method: 'PATCH',
    session,
    body: { printerEnabled: on },
    op: 'branch.printer',
  });
}

async function setCounterMode(session, branchId, on) {
  const r = await call(`/api/branches/${branchId}`, {
    method: 'PATCH',
    session,
    body: { counterMode: on },
    op: 'branch.counter',
  });
  if (!r.ok) throw new Error('counterMode: ' + (r.code || r.message));
}

async function loadMenu(slug, branchId, tableToken) {
  const path = tableToken
    ? `/api/public/qr/${tableToken}/menu`
    : `/api/public/restaurants/${slug}/branches/${branchId}/menu`;
  const r = await call(path, { auth: false, op: 'menu.public' });
  return r.data;
}

async function prepareCafe({ session, slug, restaurantId }) {
  const branches = restaurantId
    ? await listAs(session, `/api/restaurants/${restaurantId}/branches`)
    : [];
  let branch = branches[0];
  if (!branch) {
    const mine = await call('/api/auth/me', { session, op: 'auth.me' });
    const rid = mine.data?.restaurantId || restaurantId;
    const again = rid ? await listAs(session, `/api/restaurants/${rid}/branches`) : [];
    branch = again[0];
    restaurantId = rid || restaurantId;
  }
  if (!branch) throw new Error('No branch for ' + slug);
  restaurantId = restaurantId || branch.restaurantId;
  const detail = await call(`/api/branches/${branch.id}`, { session, op: 'branch.get' });
  branch = detail.data || branch;

  await ensureTillOpen(session, branch.id);
  await ensureAccepting(session, branch.id, branch);
  await ensurePrinter(session, branch.id, true);
  const tables = await ensureTables(session, branch.id, CFG.tables);
  if (!tables.length) throw new Error('No tables for ' + slug);

  const menu = await loadMenu(slug, branch.id, tables[0].qrCodeToken);
  const items = availableItems(menu);
  if (!items.length) {
    throw new Error(`No orderable menu items for ${slug}. Run: npm run seed`);
  }

  return {
    slug,
    restaurantId,
    branchId: branch.id,
    branch,
    tables,
    items,
    session,
    counterMode: !!branch.counterMode,
  };
}

async function discoverMain() {
  const session = new Session(OWNER);
  const user = await session.login();
  const restaurantId = user.restaurantId;
  const cafe = await prepareCafe({ session, slug: SLUG, restaurantId });
  return cafe;
}

async function ensureTenant(admin, i) {
  const slug = `loadtest-cafe-${i}`;
  const email = `loadtest${i}@serva.local`;
  const password = 'Loadtest123!';
  const create = await call('/api/admin/restaurants', {
    method: 'POST',
    session: admin,
    body: {
      nameEn: `Loadtest Café ${i}`,
      nameAr: `مقهى اختبار ${i}`,
      slug,
      phone: `+96890${String(100000 + i).slice(-6)}`,
      currency: 'OMR',
      vatEnabled: true,
      vatRate: 5,
      plan: 'PRO',
      defaultBranchName: 'Main',
      owner: { fullName: `Loadtest Owner ${i}`, email, password },
    },
    op: 'admin.tenant',
  });
  if (!create.ok && create.code !== 'SLUG_ALREADY_EXISTS' && create.status !== 409) {
    throw new Error('tenant create: ' + (create.code || create.message));
  }
  const owner = new Session({ username: email, password });
  await owner.login();
  const me = await call('/api/auth/me', { session: owner, op: 'auth.me' });
  const cafe = await prepareCafe({ session: owner, slug, restaurantId: me.data?.restaurantId });

  const cats = await listAs(owner, `/api/menu/categories?restaurantId=${cafe.restaurantId}`);
  if (!cats.length) {
    const cat = await call('/api/menu/categories', {
      method: 'POST',
      session: owner,
      body: {
        restaurantId: cafe.restaurantId,
        nameEn: 'Coffee',
        nameAr: 'قهوة',
        displayOrder: 1,
      },
      op: 'menu.category',
    });
    if (cat.ok) {
      await call('/api/menu/items', {
        method: 'POST',
        session: owner,
        body: {
          restaurantId: cafe.restaurantId,
          categoryId: cat.data.id,
          nameEn: 'Americano',
          nameAr: 'أمريكانو',
          price: 1.200,
          available: true,
          preparationTimeMinutes: 4,
          displayOrder: 1,
        },
        op: 'menu.item',
      });
    }
    const menu = await loadMenu(slug, cafe.branchId, cafe.tables[0].qrCodeToken);
    cafe.items = availableItems(menu);
  }
  if (!cafe.items.length) throw new Error('tenant ' + slug + ' has no items');
  return cafe;
}

// --------------------------------------------------------------------------- actors
let phoneSeq = 90001000;
const nextPhone = () => String(phoneSeq++);

async function heartbeat(cafe, table, sessionId, stage, items) {
  const cart = stage === 'ordering' && items?.length
    ? items.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity }))
    : undefined;
  return call('/api/public/presence', {
    method: 'POST',
    auth: false,
    op: 'presence',
    body: {
      branchId: cafe.branchId,
      qrKey: table?.qrCodeToken || 'car',
      sessionId,
      stage,
      cart,
    },
  });
}

async function placeCustomerOrder(cafe, { table, asCar = false, items, name } = {}) {
  const lines = items || cartLines(cafe.items, randInt(1, 2));
  const body = {
    restaurantSlug: cafe.slug,
    branchId: cafe.branchId,
    orderType: asCar ? 'CAR' : 'DINE_IN',
    customerName: name || (asCar ? 'سائق ' + randInt(1, 99) : 'ضيف ' + randInt(1, 99)),
    items: lines,
    deviceToken: 'lt-' + Math.random().toString(36).slice(2, 14),
  };
  if (!asCar && table) body.tableToken = table.qrCodeToken;
  if (asCar) {
    body.customerPhone = nextPhone();
    body.carPlate = 'LT ' + randInt(1000, 9999);
    body.carColor = pick(['white', 'black', 'silver', 'red']);
  } else if (Math.random() < 0.35) {
    body.customerPhone = nextPhone();
  }
  const r = await call('/api/public/orders', { method: 'POST', auth: false, body, op: 'order.create' });
  if (r.ok) noteDaily(cafe.branchId, r.data?.dailyNumber);
  return r;
}

async function customerVu(cafe, stopAt, { holdSseMs = 12_000, think = true } = {}) {
  while (Date.now() < stopAt) {
    const table = pick(cafe.tables);
    const sessionId = 's-' + Math.random().toString(36).slice(2, 12);
    const asCar = Math.random() < 0.2;
    await loadMenu(cafe.slug, cafe.branchId, asCar ? null : table.qrCodeToken);
    await heartbeat(cafe, asCar ? null : table, sessionId, 'viewing');
    if (think) await sleep(randInt(80, 400));
    const lines = cartLines(cafe.items, randInt(1, 3));
    await heartbeat(cafe, asCar ? null : table, sessionId, 'ordering', lines);
    if (think && Math.random() < 0.08 && lines) {
      await call(
        `/api/public/loyalty/summary?slug=${encodeURIComponent(cafe.slug)}&phone=${nextPhone()}`,
        { auth: false, op: 'loyalty.summary' },
      );
    }
    const placed = await placeCustomerOrder(cafe, { table, asCar, items: lines });
    if (placed.ok && placed.data?.trackingToken) {
      const token = placed.data.trackingToken;
      await call(`/api/public/orders/${token}`, { auth: false, op: 'order.track' });
      const sse = await openSse(`/api/public/orders/${token}/stream`, { label: 'sse.customer' });
      await Promise.race([sleep(holdSseMs), sse.done]);
      sse.close();
    }
    await heartbeat(cafe, asCar ? null : table, sessionId, 'leave');
    if (!think) break;
  }
}

function kitchen(cafe, { delayMs = CFG.kitchenMs, inflight = new Set() } = {}) {
  let running = true;
  let paused = false;
  const queue = [];

  async function act(id, status) {
    if (!id || inflight.has(id)) return;
    inflight.add(id);
    try {
      if (status === 'PENDING') {
        await call(`/api/dashboard/orders/${id}/accept`, {
          method: 'PATCH', session: cafe.session, body: { prepTimeMinutes: 6 }, op: 'order.accept',
        });
      } else if (status === 'ACCEPTED' || status === 'PREPARING') {
        await call(`/api/dashboard/orders/${id}/ready`, {
          method: 'PATCH', session: cafe.session, op: 'order.ready',
        });
      } else if (status === 'READY') {
        if (Math.random() < 0.5) {
          await call(`/api/payments/orders/${id}/mark-paid`, {
            method: 'POST', session: cafe.session, body: { method: pick(['CASH', 'CARD']) }, op: 'order.pay',
          });
        }
        if (Math.random() < 0.6) {
          await call(`/api/dashboard/print-jobs?orderId=${id}`, {
            method: 'POST', session: cafe.session, op: 'print.enqueue',
          });
        }
        await call(`/api/dashboard/orders/${id}/complete`, {
          method: 'PATCH', session: cafe.session, op: 'order.complete',
        });
      }
    } finally {
      inflight.delete(id);
    }
  }

  const loop = (async () => {
    while (running) {
      if (!paused) {
        while (queue.length) {
          const job = queue.shift();
          await act(job.id, job.status);
        }
        const live = await call(`/api/dashboard/orders/live?branchId=${cafe.branchId}`, {
          session: cafe.session, op: 'order.live',
        });
        const list = Array.isArray(live.data) ? live.data : [];
        stats.livePeak = Math.max(stats.livePeak, list.length);
        for (const o of list) await act(o.id, o.status);
      }
      await sleep(delayMs);
    }
  })();

  return {
    pause() { paused = true; },
    resume() { paused = false; },
    enqueue(id, status) { if (id) queue.push({ id, status }); },
    async drain(timeoutMs = 60_000) {
      paused = false;
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        const live = await call(`/api/dashboard/orders/live?branchId=${cafe.branchId}`, {
          session: cafe.session, op: 'order.live',
        });
        const list = Array.isArray(live.data) ? live.data : [];
        if (!list.length && !inflight.size) return;
        for (const o of list) await act(o.id, o.status);
        await sleep(200);
      }
    },
    async stop() { running = false; await loop; },
  };
}

function printStation(cafe) {
  let running = true;
  const stationId = 'st-load-' + Math.random().toString(36).slice(2, 8);
  const loop = (async () => {
    while (running) {
      const pulled = await call(
        `/api/dashboard/print-jobs/pull?branchId=${cafe.branchId}&stationId=${stationId}`,
        { method: 'POST', session: cafe.session, op: 'print.pull' },
      );
      const jobs = Array.isArray(pulled.data) ? pulled.data : [];
      for (const job of jobs) {
        if (!job?.id) continue;
        await sleep(40);
        await call(`/api/dashboard/print-jobs/${job.id}/ack`, {
          method: 'POST', session: cafe.session, op: 'print.ack',
        });
      }
      await call(`/api/dashboard/print-jobs/station?branchId=${cafe.branchId}`, {
        session: cafe.session, op: 'print.station',
      });
      await sleep(1000);
    }
  })();
  return { async stop() { running = false; await loop; } };
}

function livePoller(cafe) {
  let running = true;
  const loop = (async () => {
    while (running) {
      const live = await call(`/api/dashboard/orders/live?branchId=${cafe.branchId}`, {
        session: cafe.session, op: 'order.live',
      });
      const list = Array.isArray(live.data) ? live.data : [];
      stats.livePeak = Math.max(stats.livePeak, list.length);
      await call(`/api/dashboard/qr-activity?branchId=${cafe.branchId}`, {
        session: cafe.session, op: 'qr.activity',
      });
      await sleep(2000);
    }
  })();
  return { async stop() { running = false; await loop; } };
}

async function staffPadBurst(cafe, nOrders) {
  const table = pick(cafe.tables);
  for (let i = 0; i < nOrders; i++) {
    const body = {
      branchId: cafe.branchId,
      orderType: 'DINE_IN',
      tableId: table.id,
      customerName: 'Walk-in ' + i,
      pagerNumber: String(randInt(1, 40)),
      items: cartLines(cafe.items, 1),
      paid: Math.random() < 0.6,
      paymentMethod: pick(['CASH', 'CARD']),
    };
    const r = await call('/api/dashboard/orders', {
      method: 'POST', session: cafe.session, body, op: 'order.staff',
    });
    if (r.ok) noteDaily(cafe.branchId, r.data?.dailyNumber);
  }
}

async function openDashboards(cafe, n) {
  const handles = [];
  const inflight = new Set();
  for (let i = 0; i < n; i++) {
    const kit = kitchen(cafe, { inflight });
    const sse = await openSse(`/api/dashboard/orders/stream?branchId=${cafe.branchId}`, {
      session: cafe.session,
      label: 'sse.dashboard',
      onEvent(name, data) {
        if (data?.id && name.startsWith('order.')) {
          const status = data.status;
          if (status === 'PENDING' || status === 'ACCEPTED' || status === 'READY') {
            kit.enqueue(data.id, status);
          }
        }
      },
    });
    const qa = await openSse(`/api/dashboard/qr-activity/stream?branchId=${cafe.branchId}`, {
      session: cafe.session,
      label: 'sse.qr',
    });
    handles.push({ kit, sse, qa });
  }
  const kits = handles.map((h) => h.kit);
  return {
    kits,
    primary: kits[0],
    pause() { for (const k of kits) k.pause(); },
    resume() { for (const k of kits) k.resume(); },
    async drain(ms) { await kits[0]?.drain(ms); },
    async stop() {
      for (const h of handles) {
        h.sse.close();
        h.qa.close();
        await h.kit.stop();
      }
    },
  };
}

// --------------------------------------------------------------------------- scenarios
function banner(title) {
  console.log('\n── ' + title + ' ──');
}

async function runSoak(cafe) {
  banner(`Soak  ${CFG.soakStreams} customer streams + dashboards for ${CFG.soakS}s`);
  const tokens = [];
  for (let i = 0; i < CFG.soakStreams; i++) {
    const placed = await placeCustomerOrder(cafe, { table: cafe.tables[i % cafe.tables.length] });
    if (placed.ok && placed.data?.trackingToken) tokens.push(placed.data.trackingToken);
  }
  const streams = [];
  for (const token of tokens) {
    streams.push(await openSse(`/api/public/orders/${token}/stream`, { label: 'sse.customer' }));
  }
  await sleep(CFG.soakS * 1000);
  // Burst while the idle streams are still open — this is the reconnect/fan-out case.
  banner('Soak burst (streams still held)');
  await Promise.all(Array.from({ length: Math.min(12, CFG.customers) }, () =>
    placeCustomerOrder(cafe, { table: pick(cafe.tables) })));
  await sleep(2000);
  for (const s of streams) s.close();
}

async function runRush(cafe, { kits }) {
  banner(`Rush  ${CFG.customers} customers × ${CFG.rushS}s + kitchen + pad + print`);
  const stopAt = Date.now() + CFG.rushS * 1000;
  const vus = Array.from({ length: CFG.customers }, () => customerVu(cafe, stopAt));
  const pad = staffPadBurst(cafe, Math.max(4, Math.round(CFG.customers / 4)));
  await Promise.all([...vus, pad]);
  if (kits?.length) await kits[0].drain(30_000);
}

async function runBacklog(cafe, { kit }) {
  banner(`Backlog  ${CFG.backlogN} orders with kitchen paused`);
  kit?.pause();
  await Promise.all(Array.from({ length: CFG.backlogN }, (_, i) =>
    placeCustomerOrder(cafe, { table: cafe.tables[i % cafe.tables.length] })));
  for (let i = 0; i < 6; i++) {
    const live = await call(`/api/dashboard/orders/live?branchId=${cafe.branchId}`, {
      session: cafe.session, op: 'order.live',
    });
    const nLive = Array.isArray(live.data) ? live.data.length : 0;
    stats.livePeak = Math.max(stats.livePeak, nLive);
    console.log(`  live board  n=${nLive}  ${fmtMs(live.ms)}ms`);
    await sleep(800);
  }
  kit?.resume();
  await kit?.drain(90_000);
}

async function runStock(cafe, { kit }) {
  banner(`Stock  ${CFG.stockBurst} concurrent orders vs daily cap ${CFG.stockCap}`);
  kit?.pause();
  const item = cafe.items[0];
  const prev = cafe.counterMode;
  await call(`/api/branches/${cafe.branchId}/menu-stock/${item.id}`, {
    method: 'PUT', session: cafe.session, body: { dailyLimit: CFG.stockCap }, op: 'stock.cap',
  });
  await setCounterMode(cafe.session, cafe.branchId, true);
  try {
    const results = await Promise.all(Array.from({ length: CFG.stockBurst }, () =>
      call('/api/public/orders', {
        method: 'POST',
        auth: false,
        op: 'order.create.stock',
        body: {
          restaurantSlug: cafe.slug,
          branchId: cafe.branchId,
          tableToken: cafe.tables[0].qrCodeToken,
          orderType: 'DINE_IN',
          customerName: 'Stock',
          items: [orderLine(item, 1)],
        },
      })));
    for (const r of results) {
      if (r.ok) {
        stats.stockOk++;
        noteDaily(cafe.branchId, r.data?.dailyNumber);
      } else if (r.code === 'MENU_ITEM_UNAVAILABLE') stats.stockSoldOut++;
    }
    console.log(`  accepted ${stats.stockOk}  sold-out ${stats.stockSoldOut}  other ${
      results.length - stats.stockOk - stats.stockSoldOut}`);
  } finally {
    await call(`/api/branches/${cafe.branchId}/menu-stock/${item.id}`, {
      method: 'PUT', session: cafe.session, body: {}, op: 'stock.cap.clear',
    });
    await setCounterMode(cafe.session, cafe.branchId, !!prev);
    kit?.resume();
    await kit?.drain(60_000);
  }
}

async function runCeiling(cafe, { kit }) {
  banner(`Ceiling  ${CFG.ceilingVus} writers × ${CFG.ceilingS}s (ingest only)`);
  kit?.pause();
  const stopAt = Date.now() + CFG.ceilingS * 1000;
  const writer = async () => {
    while (Date.now() < stopAt) {
      await placeCustomerOrder(cafe, { table: pick(cafe.tables) });
    }
  };
  await Promise.all(Array.from({ length: CFG.ceilingVus }, writer));
  kit?.resume();
  await kit?.drain(90_000);
}

async function runTenants(admin) {
  banner(`Tenants  ${CFG.tenants} extra cafés in parallel`);
  const cafes = [];
  for (let i = 1; i <= CFG.tenants; i++) {
    const cafe = await ensureTenant(admin, i);
    cafes.push(cafe);
    console.log(`  ${cafe.slug}  branch=${cafe.branchId}  items=${cafe.items.length}`);
  }
  const workers = [];
  const stops = [];
  for (const cafe of cafes) {
    const boards = await openDashboards(cafe, 1);
    const printer = printStation(cafe);
    stops.push(async () => { await printer.stop(); await boards.stop(); });
    const stopAt = Date.now() + CFG.tenantS * 1000;
    for (let i = 0; i < CFG.tenantCustomers; i++) workers.push(customerVu(cafe, stopAt));
  }
  await Promise.all(workers);
  for (const stop of stops) await stop();
}

// --------------------------------------------------------------------------- report
function report() {
  const elapsed = (Date.now() - stats.startedAt) / 1000;
  console.log('\n════════ load test report ════════');
  console.log(`target     ${BASE}`);
  console.log(`scenario   ${arg}${QUICK ? ' (quick)' : ''}`);
  console.log(`elapsed    ${elapsed.toFixed(1)}s`);
  console.log(`sse peak   ${stats.ssePeak}   events ${stats.sseEvents}   errors ${stats.sseErrors}`);
  console.log(`live peak  ${stats.livePeak} orders on the board`);
  const dailyTotal = [...stats.daily.values()].reduce((a, s) => a + s.size, 0);
  console.log(`tickets    ${dailyTotal} unique daily numbers   collisions ${stats.dailyDup}`);
  if (stats.stockOk + stats.stockSoldOut) {
    console.log(`stock      accepted ${stats.stockOk} / cap ${CFG.stockCap}   sold-out ${stats.stockSoldOut}`);
  }

  const rows = [...stats.ops.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  console.log('\n' + [
    'op'.padEnd(22),
    'n'.padStart(6),
    'ok'.padStart(6),
    'fail'.padStart(6),
    'p50'.padStart(7),
    'p95'.padStart(7),
    'p99'.padStart(7),
    'max'.padStart(7),
  ].join(' '));
  for (const [name, s] of rows) {
    const times = s.times.slice().sort((a, b) => a - b);
    const nTot = s.ok + s.fail;
    console.log([
      name.slice(0, 22).padEnd(22),
      String(nTot).padStart(6),
      String(s.ok).padStart(6),
      String(s.fail).padStart(6),
      fmtMs(percentile(times, 50)).padStart(7),
      fmtMs(percentile(times, 95)).padStart(7),
      fmtMs(percentile(times, 99)).padStart(7),
      fmtMs(times[times.length - 1] || 0).padStart(7),
    ].join(' '));
  }

  if (stats.errors.size) {
    console.log('\nerrors');
    for (const [k, v] of [...stats.errors.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${v}\t${k}`);
    }
  }

  const create = stats.ops.get('order.create') || { ok: 0, fail: 0, times: [] };
  const createTimes = create.times.slice().sort((a, b) => a - b);
  const unexpectedFail = [...stats.ops.entries()]
    .filter(([k]) => k !== 'order.create.stock' && k !== 'loyalty.summary' && k !== 'stock.cap' && k !== 'stock.cap.clear')
    .reduce((a, [, s]) => a + s.fail, 0);
  const unexpectedN = [...stats.ops.entries()]
    .filter(([k]) => k !== 'order.create.stock')
    .reduce((a, [, s]) => a + s.ok + s.fail, 0);

  const problems = [];
  if (stats.dailyDup) problems.push(`${stats.dailyDup} duplicate daily ticket numbers`);
  if (create.ok + create.fail > 8 && percentile(createTimes, 95) > 2000) {
    problems.push(`order.create p95 ${fmtMs(percentile(createTimes, 95))}ms (>2s)`);
  }
  if (unexpectedN && unexpectedFail / unexpectedN > 0.15) {
    problems.push(`unexpected error rate ${pct(unexpectedFail, unexpectedN)}`);
  }
  if (stats.stockOk + stats.stockSoldOut >= CFG.stockCap) {
    if (stats.stockOk > CFG.stockCap + 3) {
      problems.push(`daily cap oversold (${stats.stockOk} accepted, cap ${CFG.stockCap})`);
    }
  }

  console.log('');
  if (problems.length) {
    console.log('WARN  ' + problems.join('; '));
  } else {
    console.log('OK    no collisions, error rate in bounds, stock cap held (if run).');
  }
  console.log('Orders stay in the DB. Open the dashboard while this runs next time — that is the real test.');
  return problems.some((p) => p.includes('duplicate') || p.includes('error rate') || p.includes('oversold')) ? 1 : 0;
}

// --------------------------------------------------------------------------- main
async function main() {
  console.log(`Serva load test → ${BASE}  scenario=${arg}${QUICK ? ' quick' : ''}`);
  const cafe = await discoverMain();
  console.log(`café  ${cafe.slug}  branch=${cafe.branchId}  tables=${cafe.tables.length}  items=${cafe.items.length}`);

  const want = new Set(arg === 'all' ? SCENARIOS.filter((s) => s !== 'all') : [arg]);
  const boards = await openDashboards(cafe, CFG.dashboards);
  const printer = printStation(cafe);
  const poller = livePoller(cafe);

  process.on('SIGINT', () => {
    console.log('\ninterrupted — closing streams');
    closeAllStreams();
    process.exit(130);
  });

  try {
    if (want.has('soak')) await runSoak(cafe);
    if (want.has('rush')) await runRush(cafe, { kits: boards.kits });
    if (want.has('backlog')) await runBacklog(cafe, { kit: boards });
    if (want.has('stock')) await runStock(cafe, { kit: boards });
    if (want.has('ceiling')) await runCeiling(cafe, { kit: boards });
    if (want.has('tenants')) {
      const admin = new Session(ADMIN);
      await admin.login();
      await runTenants(admin);
    }
  } finally {
    await poller.stop();
    await printer.stop();
    await boards.stop();
    closeAllStreams();
  }

  const code = report();
  process.exit(code);
}

main().catch((e) => {
  closeAllStreams();
  console.error('✗ load test failed:', e.message);
  process.exit(1);
});
