// The printer: a socket on port 9100 that takes raw ESC/POS and can be asked how it is.
// Same conversation as android-station's EscPosPrinter/PrinterScanner, so the two apps agree
// about which bytes mean an empty roll and which addresses are worth trying.
const net = require('node:net');
const os = require('node:os');

const PRINTER_PORT = 9100;
const FALLBACK_PORTS = [9101, 9102, 515];
// Where a hand-configured printer really ends up. Only swept when asked ("Search wider").
const COMMON_SUBNETS = ['192.168.0', '192.168.1', '192.168.2', '10.0.0', '10.0.1', '172.16.0'];
// NOTE: gentle on purpose. A dead address costs the full timeout, and 48 sockets in flight
// saturated a NAT under test and found nothing at all.
const CONNECT_TIMEOUT_MS = 800;
const PARALLEL = 24;

const DLE = 0x10, EOT = 0x04;
// Every status byte carries the same fixed bits; checking them separates a printer's answer
// from a stray byte off some other service on this port.
const FIXED_MASK = 0x93, FIXED_VALUE = 0x12;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function open(host, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const fail = (e) => { clearTimeout(timer); socket.destroy(); reject(e); };
    const timer = setTimeout(() => fail(new Error('timed out')), timeoutMs);
    socket.once('error', fail);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.off('error', fail);
      socket.on('error', () => {}); // callers learn of errors from the operation that failed
      socket.setNoDelay(true);
      resolve(socket);
    });
  });
}

function readByte(socket, waitMs) {
  return new Promise((resolve) => {
    const done = (b) => {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('close', onClose);
      resolve(b);
    };
    const onData = (chunk) => done(chunk[0]);
    const onClose = () => done(null);
    const timer = setTimeout(() => done(null), waitMs);
    socket.on('data', onData);
    socket.on('close', onClose);
  });
}

// DLE EOT n, real-time status. Plenty of clones never answer, so null means "unknown", not a fault.
async function askStatus(socket, waitMs) {
  const ask = async (n) => {
    socket.write(Buffer.from([DLE, EOT, n]));
    const b = await readByte(socket, waitMs);
    return b != null && (b & FIXED_MASK) === FIXED_VALUE ? b : null;
  };
  const printer = await ask(1);
  if (printer == null) return null;
  const paper = await ask(4);
  return { online: (printer & 0x08) === 0, paperOut: paper != null && (paper & 0x60) === 0x60 };
}

function problem(status) {
  if (!status) return null;
  if (status.paperOut) return 'out of paper';
  if (!status.online) return 'offline — check the cover is closed';
  return null;
}

async function status(host, port, timeoutMs = 1200) {
  let socket;
  try {
    socket = await open(host, port, timeoutMs);
    return await askStatus(socket, timeoutMs);
  } catch {
    return null;
  } finally {
    socket?.destroy();
  }
}

async function probe(host, port = PRINTER_PORT, timeoutMs = 2000) {
  try {
    (await open(host, port, timeoutMs)).destroy();
    return true;
  } catch {
    return false;
  }
}

/**
 * Sends a job, and refuses when the printer says it would produce nothing (empty roll, open
 * cover) — the failure that otherwise looks exactly like success.
 */
async function send({ host, port }, bytes) {
  // NOTE: one socket for status and the job. Printers that accept a single connection stall
  // if we probe, hang up, and come back with the bytes.
  const socket = await open(host, port, 15000).catch((e) => {
    throw new Error(`Printer not answering at ${host} (${e.code ?? e.message})`);
  });
  try {
    const trouble = problem(await askStatus(socket, 1200));
    if (trouble) throw new Error(`Printer is ${trouble}`);
    await new Promise((resolve, reject) => {
      socket.setTimeout(15000, () => reject(new Error('The printer did not take the job in time')));
      socket.once('error', reject);
      socket.end(bytes, (err) => (err ? reject(err) : resolve()));
    });
    // NOTE: cheap controllers drop the tail of a job if the socket closes on the last byte.
    await sleep(Math.min(800, Math.max(150, 150 + bytes.length / 80)));
  } finally {
    socket.destroy();
  }
}

/* *** finding it *** */

let cancelled = false;
const cancel = () => { cancelled = true; };

const toInt = (ip) => ip.split('.').reduce((acc, o) => acc * 256 + Number(o), 0);
const toIp = (n) => [24, 16, 8, 0].map((s) => Math.floor(n / 2 ** s) % 256).join('.');
const isPrivate = (ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);

// Every private IPv4 this PC holds, not only the first: Wi-Fi plus Ethernet is common, and
// sweeping only one of them is how a printer that is plainly there goes unfound.
function networks() {
  return Object.values(os.networkInterfaces()).flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal && isPrivate(a.address))
    .map((a) => ({ address: a.address, prefix: Number(a.cidr?.split('/')[1] ?? 24) }));
}

const maskOf = (prefix) => (prefix <= 0 ? 0 : (0xffffffff << (32 - Math.min(prefix, 32))) >>> 0);

// Never wider than a /24: a /16 is 65,000 addresses and hours of timeouts.
function hostsOf({ address, prefix }) {
  const p = Math.max(prefix, 24);
  const network = (toInt(address) & maskOf(p)) >>> 0;
  const size = 2 ** (32 - p);
  if (size < 4) return [];
  return Array.from({ length: size - 2 }, (_, i) => toIp(network + 1 + i));
}

/** The networks this PC is on, as a café would read them: "192.168.1.x". */
function subnetLabels() {
  return [...new Set(networks().map((n) => n.address.split('.').slice(0, 3).join('.') + '.x'))];
}

/** Could this PC reach the address directly, or would it go to the router and be dropped? */
function onLocalSubnet(host) {
  if (!net.isIPv4(host) || host.startsWith('127.')) return true; // a name, or this PC itself
  return networks().some((n) => ((toInt(n.address) & maskOf(n.prefix)) >>> 0) === ((toInt(host) & maskOf(n.prefix)) >>> 0));
}

async function sweep(hosts, port, progress) {
  const found = [];
  for (let i = 0; i < hosts.length && !cancelled; i += PARALLEL) {
    const batch = hosts.slice(i, i + PARALLEL);
    const open = await Promise.all(batch.map((h) => probe(h, port, CONNECT_TIMEOUT_MS)));
    batch.forEach((host, j) => { if (open[j]) found.push({ host, port }); });
    progress(batch.length);
  }
  return found;
}

// An answer to ESC/POS status proves a printer; silence does not disprove one.
async function confirm(hits) {
  const out = [];
  for (const hit of hits) {
    if (cancelled) { out.push(hit); continue; }
    const s = await status(hit.host, hit.port);
    out.push({ ...hit, confirmed: s != null, paperOut: !!s?.paperOut });
  }
  return out.sort((a, b) => (b.confirmed ?? false) - (a.confirmed ?? false));
}

/** Sweeps every network this PC is on for something answering on the print port. */
async function scan(onProgress) {
  cancelled = false;
  const nets = networks();
  const self = new Set(nets.map((n) => n.address));
  const hosts = [...new Set(nets.flatMap(hostsOf))].filter((h) => !self.has(h));
  let done = 0, total = hosts.length;
  const progress = (n) => onProgress((done += n), total);
  let hits = await sweep(hosts, PRINTER_PORT, progress);
  // Nothing on the usual port: widen rather than tell a café its printer does not exist.
  for (const port of FALLBACK_PORTS) {
    if (hits.length || cancelled) break;
    total = hosts.length * (1 + FALLBACK_PORTS.length);
    hits = await sweep(hosts, port, progress);
  }
  return confirm(hits);
}

/** The last resort for a printer left on a fixed address from wherever it was installed. */
async function scanWider(onProgress) {
  cancelled = false;
  const swept = new Set(networks().flatMap(hostsOf));
  const hosts = COMMON_SUBNETS.flatMap((p) => Array.from({ length: 254 }, (_, i) => `${p}.${i + 1}`)).filter((h) => !swept.has(h));
  let done = 0;
  return confirm(await sweep(hosts, PRINTER_PORT, (n) => onProgress((done += n), hosts.length)));
}

/**
 * The setup slip. Plain ESC/POS text, not a rendered receipt: this step tests the socket,
 * the paper and the cut, so a failure here can only mean one thing.
 */
function testSlip(branchName, stationId, printerHost) {
  // NOTE: thermal text mode cannot shape Arabic; anything non-ASCII would print as "?".
  const ascii = (value, fallback) => (/^[\x20-\x7e]*$/.test(value) && value ? value.slice(0, 28) : fallback);
  const text = (s) => Buffer.from(s + '\n', 'ascii');
  const esc = (...b) => Buffer.from(b);
  return Buffer.concat([
    esc(0x1b, 0x40), esc(0x1b, 0x61, 1), esc(0x1d, 0x21, 0x11), text('SERVA'), esc(0x1d, 0x21, 0),
    text(''), text('Print station connected'), text(''), esc(0x1b, 0x61, 0),
    text(`Branch:  ${ascii(branchName, 'this branch')}`),
    // The address: a café can have two printers answering, and the slip says which one this is.
    text(`Printer: ${ascii(printerHost, 'this printer')}`),
    text(`Device:  ${ascii(stationId, 'this station')}`),
    text(''), esc(0x1b, 0x61, 1),
    text('If this came out of the printer'), text('at your counter, you are set up.'),
    text('If it came out of another one,'), text('go back and pick the other address.'),
    esc(0x1b, 0x64, 4), esc(0x1d, 0x56, 0x42, 0),
  ]);
}

module.exports = { PRINTER_PORT, send, probe, status, scan, scanWider, cancel, subnetLabels, onLocalSubnet, networks, testSlip };
