// The station: pull → render → print → acknowledge. Same contract as android-station's
// StationService and station/station.mjs, so the server cannot tell the three apart.
const { app, BrowserWindow, net, powerSaveBlocker, safeStorage, session } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const printer = require('./printer');

const POLL_MS = 5000;
const PAUSED = 'Paused — tickets will wait until you resume';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* *** what this PC is *** */

let cfg = {};
const file = () => path.join(app.getPath('userData'), 'station.json');

function load() {
  try {
    cfg = JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch {
    cfg = {};
  }
  cfg = { apiBase: 'https://serva.om', printerPort: printer.PRINTER_PORT, paperWidth: 80, unacked: [], ...cfg };
  // NOTE: minted once and kept. A new id on each start would let a job this station already
  // claimed be handed to "another" station and print twice. Never "st-": the server reads
  // that prefix as a browser tab, and the dashboard would not see this app collecting.
  if (!cfg.stationId) {
    cfg.stationId = 'windows-' + crypto.randomBytes(6).toString('hex');
    save();
  }
}

function save() {
  const data = JSON.stringify(cfg, null, 2);
  try {
    fs.writeFileSync(file() + '.tmp', data);
    fs.renameSync(file() + '.tmp', file());
  } catch {
    fs.writeFileSync(file(), data); // antivirus can hold the old file open and refuse the rename
  }
}

// DPAPI on Windows: the password is readable only by this Windows user on this PC.
const seal = (s) => (safeStorage.isEncryptionAvailable() ? 'enc:' + safeStorage.encryptString(s).toString('base64') : s);
function unseal(s = '') {
  try {
    return s.startsWith('enc:') ? safeStorage.decryptString(Buffer.from(s.slice(4), 'base64')) : s;
  } catch {
    return ''; // another Windows user or a reset profile: the login fails and says to sign in again
  }
}

const configured = () => !!(cfg.setupComplete && cfg.username && cfg.branchId && cfg.printerHost);
const collecting = () => configured() && !cfg.paused;
const target = () => ({ host: cfg.printerHost, port: cfg.printerPort });

/* *** Serva *** */

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let tokens = null;

async function request(method, p, body, token) {
  const res = await net.fetch(cfg.apiBase + p, {
    method,
    // NOTE: a POST that follows a redirect becomes a GET; the pull then claims nothing and
    // tickets sit in the queue looking like a dead printer.
    redirect: 'manual',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: body == null ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (res.status >= 300 && res.status < 400) throw new ApiError(res.status, `Serva redirected (${res.status}). Use the https address.`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json.message || `${method} ${p} → ${res.status}`);
  return json.data;
}

async function login(username = cfg.username, password = unseal(cfg.password)) {
  tokens = await request('POST', '/api/auth/login', { username, password });
  return tokens.user ?? {};
}

// One retry behind a refresh: an access token outlives a shift but not a week.
async function api(method, p, body) {
  if (!tokens) await login();
  try {
    return await request(method, p, body, tokens.accessToken);
  } catch (e) {
    if (e.status !== 401) throw e;
    try {
      const fresh = await request('POST', '/api/auth/refresh', { refreshToken: tokens.refreshToken });
      tokens = { ...tokens, accessToken: fresh.accessToken, refreshToken: fresh.refreshToken || tokens.refreshToken };
    } catch {
      await login();
    }
    return request(method, p, body, tokens.accessToken);
  }
}

/* *** the receipt *** */

// The server's /print/render page draws every slip, in a window nobody sees. It is the same
// React component and rasteriser the dashboard prints with, so a café changing its receipt
// style sees it on the next ticket with no app update.
let renderer = null;
let renderFailures = 0;

function dropRenderer() {
  if (renderer && !renderer.isDestroyed()) renderer.destroy();
  renderer = null;
}

async function startRenderer() {
  await session.defaultSession.clearCache(); // or yesterday's layout keeps printing after a deploy
  const win = new BrowserWindow({ show: false, skipTaskbar: true, width: 800, height: 2000, webPreferences: { backgroundThrottling: false } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('render-process-gone', () => { if (renderer === win) dropRenderer(); });
  let httpStatus = 200;
  win.webContents.on('did-navigate', (_e, _url, code) => { httpStatus = code; });
  renderer = win;
  try {
    await win.loadURL(`${cfg.apiBase}/print/render`);
    if (httpStatus >= 400) throw new Error(`the receipt page answered HTTP ${httpStatus}`);
    for (let i = 0; i < 30; i++) {
      if (await win.webContents.executeJavaScript('window.servaRenderReady === true')) return;
      await sleep(500);
    }
    throw new Error('the receipt page loaded but the renderer did not become ready');
  } catch (e) {
    dropRenderer();
    throw e;
  }
}

async function render(job) {
  if (!renderer) await startRenderer();
  const request = {
    order: job.order,
    restaurant: job.receipt ?? null,
    tableNumber: job.receipt?.tableNumber || null,
    paperWidth: cfg.paperWidth === 58 ? 58 : 80,
  };
  let timer, result;
  const late = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('the renderer did not answer in time')), 60000); });
  try {
    result = await Promise.race([renderer.webContents.executeJavaScript(`window.servaRenderJob(${JSON.stringify(request)})`), late]);
  } catch (e) {
    dropRenderer(); // crashed or wedged: rebuild it before the next ticket
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!result?.ok) {
    if (++renderFailures >= 3) dropRenderer(); // three in a row means the page, not the ticket
    throw new Error(result?.error || 'render failed');
  }
  renderFailures = 0;
  return Buffer.from(result.base64, 'base64');
}

/* *** the loop *** */

const state = { status: 'Not set up yet', cloudOk: false, printerOk: false, lastPullAt: 0, lastPrintAt: 0 };
const events = { notify: () => {} };

function snapshot() {
  return {
    ...state,
    configured: configured(),
    paused: !!cfg.paused,
    username: cfg.username ?? '',
    branchName: cfg.branchName ?? '',
    printerHost: cfg.printerHost ?? '',
    paperWidth: cfg.paperWidth,
    stationId: cfg.stationId,
  };
}

function update(patch) {
  Object.assign(state, patch);
  events.notify('state', snapshot());
}

function describe(e) {
  if (e.status === 401) return 'The staff password was rejected — open Serva Station and sign in again';
  if (e.status >= 400 && e.status < 500) return e.message;
  return `Offline: ${e.message}`;
}

const ticket = (job) => job.order?.dailyNumber ?? '?';

async function ack(id) {
  await api('POST', `/api/dashboard/print-jobs/${id}/ack`, {});
  cfg.unacked = cfg.unacked.filter((x) => x !== id);
  save();
}

async function tick() {
  const jobs = (await api('POST', `/api/dashboard/print-jobs/pull?branchId=${cfg.branchId}&stationId=${encodeURIComponent(cfg.stationId)}`, {})) ?? [];
  update({ cloudOk: true, lastPullAt: Date.now() });
  for (const job of jobs) {
    if (!collecting()) return;
    // Printed on an earlier pass and the ack was lost: retry the ack, never the print.
    if (cfg.unacked.includes(job.id)) {
      await ack(job.id).catch(() => {});
      continue;
    }
    let bytes;
    try {
      bytes = await render(job);
    } catch (e) {
      update({ status: `Could not draw ticket #${ticket(job)}: ${e.message}` });
      continue; // not acknowledged, so the server offers it again
    }
    try {
      await printer.send(target(), bytes);
    } catch (e) {
      const why = e.message.startsWith('Printer is') ? e.message : `Printer not answering at ${cfg.printerHost} — check it is on and on the network`;
      update({ printerOk: false, status: why });
      return; // the rest wait for the next pass, in order, rather than each paying the timeout
    }
    cfg.unacked.push(job.id);
    save(); // on disk before the ack leaves
    update({ printerOk: true, lastPrintAt: Date.now(), status: `Printed #${ticket(job)}` });
    await ack(job.id).catch(() => {});
  }
}

let awake = null;
function keepAwake(on) {
  if (on && awake == null) awake = powerSaveBlocker.start('prevent-app-suspension');
  if (!on && awake != null) {
    powerSaveBlocker.stop(awake);
    awake = null;
  }
}

async function pass() {
  if (!renderer) {
    try {
      await startRenderer();
    } catch (e) {
      update({ status: `Could not load the receipt renderer — ${e.message}` });
      await sleep(10000);
      return;
    }
    // Say something true about the printer before the first ticket needs it.
    const up = await printer.probe(cfg.printerHost, cfg.printerPort);
    update({ printerOk: up, status: up ? `Collecting for ${cfg.branchName}` : `Printer ${cfg.printerHost} is not answering — collecting anyway, will print when it is back` });
  }
  try {
    await tick();
  } catch (e) {
    update({ cloudOk: false, status: describe(e) });
  }
}

async function run() {
  if (!configured()) update({ status: 'Not set up yet' });
  else if (cfg.paused) update({ status: PAUSED });
  for (;;) {
    keepAwake(collecting());
    if (collecting()) await pass();
    await sleep(POLL_MS);
  }
}

/* *** setting up *** */

const branchName = (b) => b.nameEn || b.nameAr || b.name || `Branch ${b.id}`;
const progress = (done, total) => events.notify('progress', { done, total });

const actions = {
  snapshot,

  async signIn({ username, password }) {
    const user = await login(username, password);
    if (!user.restaurantId) throw new Error('That account is not attached to a café. Use a staff login for this branch.');
    Object.assign(cfg, { username, password: seal(password), restaurantId: user.restaurantId });
    save();
    const all = (await api('GET', `/api/restaurants/${user.restaurantId}/branches`)) ?? [];
    // A branch-scoped account must not be offered branches it cannot pull for.
    const scoped = user.branchId ? all.filter((b) => b.id === user.branchId) : [];
    return (scoped.length ? scoped : all).map((b) => ({ id: b.id, name: branchName(b), address: b.address ?? '' }));
  },

  pickBranch({ id, name }) {
    Object.assign(cfg, { branchId: id, branchName: name });
    save();
  },

  onNetwork: () => printer.networks().length > 0,
  scan: () => printer.scan(progress),
  scanWider: () => printer.scanWider(progress),
  cancelScan: () => printer.cancel(),

  // The address came off a FEED slip, so something is there. Check the one thing that makes
  // it unreachable before spending a timeout on it: that it is not on this PC's network.
  async checkAddress(host) {
    const mine = printer.subnetLabels()[0];
    if (mine && !printer.onLocalSubnet(host)) return { wrongNetwork: mine };
    return { reachable: await printer.probe(host) };
  },

  usePrinter({ host, port }) {
    printer.cancel();
    Object.assign(cfg, { printerHost: host, printerPort: port || printer.PRINTER_PORT });
    save();
  },

  async testSlip() {
    try {
      await printer.send(target(), printer.testSlip(cfg.branchName ?? '', cfg.stationId, cfg.printerHost));
    } catch (e) {
      update({ printerOk: false });
      throw e;
    }
    update({ printerOk: true });
  },

  finish({ paperWidth }) {
    Object.assign(cfg, { paperWidth: paperWidth === 58 ? 58 : 80, setupComplete: true, paused: false });
    save();
    dropRenderer(); // picks up a changed server or paper width on the next pass
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true, args: ['--background'] });
    update({ printerOk: true, status: `Collecting for ${cfg.branchName}` });
  },

  togglePause() {
    cfg.paused = !cfg.paused;
    save();
    update({ status: cfg.paused ? PAUSED : `Collecting for ${cfg.branchName}` });
  },

  changeSetup() {
    cfg.setupComplete = false;
    save();
    update({ status: 'Not set up yet' });
  },
};

module.exports = { load, run, actions, events, snapshot, collecting };
