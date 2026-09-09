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
 *   5. Acknowledge. Until it does, the job stays PENDING and is offered again. Ids of jobs
 *      that printed but were not yet acknowledged are kept beside the config, so a restart
 *      in that gap retries the ack and does not print the ticket a second time.
 *
 *   node station.mjs ./station.json
 *
 * Needs Chromium once: `npx playwright install chromium`, or point PLAYWRIGHT_CHROMIUM at
 * an existing build.
 */
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
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

const unackedPath = cfgPath.replace(/(\.[^./\\]+)?$/, (ext) => `.unacked${ext || '.json'}`);

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

let browser = null;
let page = null;

function pageDead() {
  return !page || page.isClosed();
}

function isPageError(e) {
  if (pageDead()) return true;
  const m = String(e?.message ?? e);
  return /target closed|session closed|has been closed|execution context was destroyed|page crashed|browser has been closed/i.test(m);
}

async function openRenderer(browser) {
  if (page) await page.close().catch(() => {});
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
  const once = async () => {
    const result = await page.evaluate((r) => window.servaRenderJob(r), request);
    if (!result?.ok) throw new Error(`render failed: ${result?.error ?? 'unknown'}`);
    return Buffer.from(result.base64, 'base64');
  };
  if (pageDead()) await openRenderer(browser);
  try {
    return await once();
  } catch (e) {
    if (!isPageError(e)) throw e;
    log('renderer died, reopening');
    await openRenderer(browser);
    return await once();
  }
}

/* ---------------------------------------------------------------- the printer */

const DLE = 0x10, EOT = 0x04;
const STATUS_PRINTER = 1, STATUS_PAPER = 4;
const STATUS_WAIT_MS = 1200;
const FIXED_MASK = 0x93, FIXED_VALUE = 0x12;

/** One status byte, or null if the printer stays silent / the socket dies. */
function readStatusByte(socket, waitMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onAbort);
      socket.off('close', onAbort);
      resolve(value);
    };
    const onData = (chunk) => {
      if (!chunk.length) return;
      finish(chunk[0]);
    };
    const onAbort = () => finish(null);
    const timer = setTimeout(() => finish(null), waitMs);
    socket.on('data', onData);
    socket.once('error', onAbort);
    socket.once('close', onAbort);
  });
}

function decodeStatus(b) {
  if (b == null || (b & FIXED_MASK) !== FIXED_VALUE) return null;
  return b;
}

/**
 * DLE EOT on the job socket. No answer (or a byte that is not a status byte) means a clone
 * that ignores the channel — print anyway. Paper-out / cover-open must not look like success.
 */
async function printerProblem(socket) {
  socket.write(Buffer.from([DLE, EOT, STATUS_PRINTER]));
  const printer = decodeStatus(await readStatusByte(socket, STATUS_WAIT_MS));
  if (printer == null) return null;
  socket.write(Buffer.from([DLE, EOT, STATUS_PAPER]));
  const paper = decodeStatus(await readStatusByte(socket, STATUS_WAIT_MS));
  if (paper != null && (paper & 0x60) === 0x60) return 'out of paper';
  if (printer & 0x08) return 'offline — check the cover is closed';
  return null;
}

/** Raw ESC/POS over TCP — what every network thermal printer speaks on port 9100. */
function sendToPrinter(bytes) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: cfg.printerHost, port: cfg.printerPort });
    let settled = false;
    const fail = (e) => {
      if (settled) return;
      settled = true;
      socket.setTimeout(0);
      socket.destroy();
      reject(e instanceof Error ? e : new Error(String(e)));
    };
    const succeed = () => {
      if (settled) return;
      settled = true;
      socket.setTimeout(0);
      socket.off('timeout', onTimeout);
      resolve();
    };
    const onTimeout = () => fail(new Error('printer did not accept the job in time'));
    socket.setNoDelay(true);
    socket.setTimeout(cfg.printTimeoutMs);
    socket.on('timeout', onTimeout);
    socket.on('error', fail);
    socket.on('connect', () => {
      printerProblem(socket).then((problem) => {
        if (settled) return;
        if (problem) return fail(new Error(`printer is ${problem}`));
        socket.end(bytes, (err) => (err ? fail(err) : succeed()));
      }, fail);
    });
  });
}

/* ---------------------------------------------------------------- the loop */

function loadUnacked() {
  try {
    const raw = JSON.parse(readFileSync(unackedPath, 'utf8'));
    if (!Array.isArray(raw)) return new Set();
    return new Set(raw.map(Number).filter((id) => Number.isFinite(id)));
  } catch {
    return new Set();
  }
}

function persistUnacked() {
  try {
    const tmp = `${unackedPath}.tmp`;
    writeFileSync(tmp, `${JSON.stringify([...printedAwaitingAck])}\n`);
    renameSync(tmp, unackedPath); // atomic on the same filesystem — a crash keeps the old file
  } catch (e) {
    log(`could not write ${unackedPath}: ${e.message}`);
  }
}

const printedAwaitingAck = loadUnacked();
let lastCollectingLog = 0;

async function tick() {
  const jobs = await api(`/api/dashboard/print-jobs/pull?branchId=${cfg.branchId}&stationId=${encodeURIComponent(cfg.stationId)}`, { method: 'POST', body: '{}' }) ?? [];
  if (!jobs.length) {
    const now = Date.now();
    if (now - lastCollectingLog >= 60_000) {
      lastCollectingLog = now;
      log('collecting');
    }
  }
  for (const job of jobs) {
    // Printed on a previous pass but the acknowledgement never landed: retry that, and on no
    // account print it again.
    if (printedAwaitingAck.has(job.id)) {
      try {
        await api(`/api/dashboard/print-jobs/${job.id}/ack`, { method: 'POST', body: '{}' });
        printedAwaitingAck.delete(job.id);
        persistUnacked();
      } catch { /* next pass */ }
      continue;
    }
    try {
      const bytes = await render(job);
      await sendToPrinter(bytes);
      printedAwaitingAck.add(job.id);
      persistUnacked();
      log(`printed #${job.order?.dailyNumber ?? '?'} (job ${job.id}, ${bytes.length} bytes)`);
    } catch (e) {
      // Not acknowledged, so the server keeps it and offers it again once the printer is back.
      log(`job ${job.id} not printed: ${e.message}`);
      continue;
    }
    try {
      await api(`/api/dashboard/print-jobs/${job.id}/ack`, { method: 'POST', body: '{}' });
      printedAwaitingAck.delete(job.id);
      persistUnacked();
    } catch (e) { log(`job ${job.id} printed but not acknowledged, will retry: ${e.message}`); }
  }
}

browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
});
await login();
await openRenderer(browser);
if (printedAwaitingAck.size) log(`${printedAwaitingAck.size} printed job(s) still awaiting ack`);
log(`station "${cfg.stationId}" collecting for branch ${cfg.branchId} → ${cfg.printerHost}:${cfg.printerPort}`);

let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { stopping = true; await browser.close().catch(() => {}); process.exit(0); });
while (!stopping) {
  try { await tick(); } catch (e) { log('poll failed:', e.message); }
  await new Promise((r) => setTimeout(r, cfg.pollMs));
}
