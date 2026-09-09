#!/usr/bin/env node
/**
 * Serva print station — headless.
 *
 * Runs beside the printer on anything with Node: a Raspberry Pi, an old laptop, a mini PC.
 * It replaces the browser tab that used to be the print station, which stopped the moment
 * someone locked the tablet or Chrome was killed. Same contract the Android app implements
 * (see android-station/), so whichever you run, the server sees the same thing.
 *
 *   1. Sign in as a staff user, exactly like any other device.
 *   2. Every few seconds, POST /print-jobs/pull with this station's id. The server records
 *      the station as collecting and CLAIMS each job for it, so two stations never print
 *      the same ticket.
 *   3. Render each job by handing it to the receipt page on the server, in a headless
 *      browser held open for the life of the process. That page is the same React component
 *      and the same rasteriser the dashboard prints with, so the slip cannot drift.
 *   4. Write the returned ESC/POS bytes straight to the printer's socket (port 9100).
 *   5. Acknowledge. Until it does, the job stays PENDING and is offered again — a crash
 *      between printing and acknowledging costs a duplicate at worst, never a lost ticket.
 *
 *   node station.mjs ./station.json
 *
 * Needs Chromium once: `npx playwright install chromium`, or point PLAYWRIGHT_CHROMIUM at
 * an existing build.
 */
import { readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { chromium } from 'playwright-core';

const cfgPath = process.argv[2] ?? './station.json';
const cfg = {
  apiBase: 'https://serva.om',
  pollMs: 5000,
  printerPort: 9100,
  paperWidth: 80,
  printTimeoutMs: 15000,
  ...JSON.parse(readFileSync(cfgPath, 'utf8')),
};
for (const required of ['username', 'password', 'branchId', 'stationId', 'printerHost']) {
  if (!cfg[required]) { console.error(`config: ${required} is required (${cfgPath})`); process.exit(2); }
}
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/* ---------------------------------------------------------------- session */

let tokens = null;
async function login() {
  const res = await fetch(`${cfg.apiBase}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: cfg.username, password: cfg.password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.data?.accessToken) throw new Error(`login failed: ${res.status} ${body?.message ?? ''}`);
  tokens = body.data;
  log(`signed in as ${cfg.username}`);
}

/** One retry after a refresh: an access token outlives a shift, but not a week. */
async function api(path, init = {}, retry = true) {
  const res = await fetch(`${cfg.apiBase}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${tokens.accessToken}`, ...(init.headers ?? {}) },
  });
  if (res.status === 401 && retry) {
    const r = await fetch(`${cfg.apiBase}/api/auth/refresh`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
    const rb = await r.json().catch(() => ({}));
    if (r.ok && rb?.data?.accessToken) tokens = rb.data;
    else await login();
    return api(path, init, false);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${body?.message ?? ''}`);
  return body.data;
}

/* ---------------------------------------------------------------- rendering */

let page = null;
async function openRenderer(browser) {
  page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') log('renderer:', m.text().slice(0, 160)); });
  await page.goto(`${cfg.apiBase}/print/render`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.servaRenderReady === true, { timeout: 30000 });
  log('renderer ready');
}

/** Job in, printable ESC/POS out. The page owns the layout; this owns nothing. */
async function render(job) {
  const request = {
    order: job.order,
    restaurant: job.receipt ?? null,
    tableNumber: job.receipt?.tableNumber ?? null,
    paperWidth: cfg.paperWidth === 58 ? 58 : 80,
  };
  const result = await page.evaluate((r) => window.servaRenderJob(r), request);
  if (!result?.ok) throw new Error(`render failed: ${result?.error ?? 'unknown'}`);
  return Buffer.from(result.base64, 'base64');
}

/* ---------------------------------------------------------------- the printer */

/** Raw ESC/POS over TCP — what every network thermal printer speaks on port 9100. */
function sendToPrinter(bytes) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: cfg.printerHost, port: cfg.printerPort });
    const fail = (e) => { socket.destroy(); reject(e); };
    socket.setTimeout(cfg.printTimeoutMs, () => fail(new Error('printer did not accept the job in time')));
    socket.on('error', fail);
    socket.on('connect', () => {
      // The socket closing cleanly after the write is the only receipt this protocol gives.
      socket.end(bytes, () => resolve());
    });
  });
}

/* ---------------------------------------------------------------- the loop */

const printedAwaitingAck = new Set();

async function tick() {
  const jobs = await api(`/api/dashboard/print-jobs/pull?branchId=${cfg.branchId}&stationId=${encodeURIComponent(cfg.stationId)}`, { method: 'POST', body: '{}' });
  for (const job of jobs) {
    // Printed on a previous pass but the acknowledgement never landed: retry that, and on no
    // account print it again.
    if (printedAwaitingAck.has(job.id)) {
      try { await api(`/api/dashboard/print-jobs/${job.id}/ack`, { method: 'POST', body: '{}' }); printedAwaitingAck.delete(job.id); } catch { /* next pass */ }
      continue;
    }
    try {
      const bytes = await render(job);
      await sendToPrinter(bytes);
      printedAwaitingAck.add(job.id);
      log(`printed #${job.order?.dailyNumber ?? '?'} (job ${job.id}, ${bytes.length} bytes)`);
    } catch (e) {
      // Not acknowledged, so the server keeps it and offers it again once the printer is back.
      log(`job ${job.id} not printed: ${e.message}`);
      continue;
    }
    try { await api(`/api/dashboard/print-jobs/${job.id}/ack`, { method: 'POST', body: '{}' }); printedAwaitingAck.delete(job.id); }
    catch (e) { log(`job ${job.id} printed but not acknowledged, will retry: ${e.message}`); }
  }
}

const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
});
await login();
await openRenderer(browser);
log(`station "${cfg.stationId}" collecting for branch ${cfg.branchId} → ${cfg.printerHost}:${cfg.printerPort}`);

let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { stopping = true; await browser.close().catch(() => {}); process.exit(0); });
while (!stopping) {
  try { await tick(); } catch (e) { log('poll failed:', e.message); }
  await new Promise((r) => setTimeout(r, cfg.pollMs));
}
