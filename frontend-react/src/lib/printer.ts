/* Print a receipt from this device.

   Two apps can carry the bytes off the tablet, chosen per DEVICE in Branch & printer
   (getPrintApp below) — it is a fact about the tablet in your hand, like the station flag:

   - RawBT (https://rawbt.ru), the original path. Installed on EVERY staff device, each
     paired with the same printer (WiFi/LAN, USB or Bluetooth) — whichever device completes
     an order prints its receipt right there (plus the manual 🖨 buttons). No print-station
     designation, no cross-device forwarding, no local server component ("Server for RawBT" /
     WebSocket integration was tried and removed — the plain rawbt: scheme handoff is what
     works reliably on the actual hardware). The scheme reports nothing back.
   - Cleanter (lib/cleanter.ts). Bluetooth printers only, but it ANSWERS every print, so the
     setup guide can show the real state of the chain and a failed ticket has a reason.

   Receipts are sent as raster on both paths (pre-built ESC/POS bytes for RawBT, a PNG for
   Cleanter), never as text: thermal printers can't do Arabic shaping/RTL, so we rasterize
   the bilingual invoice (ReceiptCapture.tsx). */

import { bytesToBase64 } from './escpos';
import type { PaperWidth } from './cleanter';

// Hidden-iframe handoff via the bare "rawbt:" scheme (no package attribute, so no Play Store
// fallback and no visible navigation). A carrier window (window.open + later .location.href)
// was tried here to preserve the tap's user-gesture across the async capture, but on mobile
// Chrome that window sometimes never got navigated or closed, leaving a blank tab open. The
// iframe never opens anything visible; a blocked launch just does nothing.
function fireSchemePrint(payload: string): void {
  const rawbtUrl = `rawbt:${payload}`;
  try {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText =
      'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;border:0';
    iframe.src = rawbtUrl;
    document.body.appendChild(iframe);
    window.setTimeout(() => {
      try { iframe.remove(); } catch { /* ignore */ }
    }, 4000);
  } catch {
    /* ignore */
  }
}

/* ---- which app carries the receipt off THIS device ---- */

/** `station` is the Serva Station app running on the counter tablet as a background
 *  service. Choosing it on a browser device means "this device does not print, the station
 *  does": every print becomes a job in the server queue, which the app collects. */
export type PrintApp = 'rawbt' | 'cleanter' | 'station';
const APP_KEY = 'cafeqr_print_app';
/** RawBT unless this device was switched over. The default is deliberately NOT the newer
 *  option: an existing café's devices store nothing for RawBT, and a changed default would
 *  silently route their prints into a queue no station is collecting. */
export function getPrintApp(): PrintApp {
  try {
    const stored = localStorage.getItem(APP_KEY);
    return stored === 'cleanter' || stored === 'station' ? stored : 'rawbt';
  } catch { return 'rawbt'; }
}
export function setPrintApp(app: PrintApp): void {
  try {
    if (app === 'rawbt') localStorage.removeItem(APP_KEY);
    else localStorage.setItem(APP_KEY, app);
  } catch { /* ignore */ }
}

/** Where a café downloads the station app from — served with the frontend, so it deploys
 *  with the build and the guide can never point at a version the server does not have. */
export const STATION_APK_PATH = '/downloads/serva-station.apk';

/** The roll in the Bluetooth printer this tablet drives through Cleanter. RawBT prints at
 *  the width measured on the café's 80mm printer and ignores this. */
const PAPER_KEY = 'cafeqr_print_paper';
export function getPaperWidth(): PaperWidth {
  try { return localStorage.getItem(PAPER_KEY) === '58' ? 58 : 80; } catch { return 80; }
}
export function setPaperWidth(width: PaperWidth): void {
  try {
    if (width === 58) localStorage.setItem(PAPER_KEY, '58');
    else localStorage.removeItem(PAPER_KEY);
  } catch { /* ignore */ }
}

/* ---- this device's name when it collects print jobs ----
   Minted once, kept forever. The server claims each job for one station id at a time, so
   this is what stops two tablets both flagged as the station from printing the same ticket.
   Random rather than derived from anything, so it is an identity and not a secret. */
const STATION_ID_KEY = 'cafeqr_station_id';
export function getStationId(): string {
  try {
    const existing = localStorage.getItem(STATION_ID_KEY);
    if (existing) return existing;
    const minted = 'st-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem(STATION_ID_KEY, minted);
    return minted;
  } catch {
    return 'st-volatile';
  }
}

/* ---- jobs this device has put through the printer but not yet had acknowledged ----
   Written the moment the printing app takes a job and cleared when the server confirms the
   ack. The one thing this survives is a reload in the gap between those two moments: on
   load the station treats these as already printed and only retries the ack, where before
   it had forgotten and printed them again. Pruned by age so a job the server has long since
   expired cannot pin the list. */
const DONE_KEY = 'cafeqr_print_done';
const DONE_TTL_MS = 20 * 60_000;
function readDone(): Record<string, number> {
  try {
    const raw = localStorage.getItem(DONE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const cutoff = Date.now() - DONE_TTL_MS;
    return Object.fromEntries(Object.entries(parsed).filter(([, at]) => at > cutoff));
  } catch { return {}; }
}
function writeDone(map: Record<string, number>): void {
  try { localStorage.setItem(DONE_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}
export function rememberPrinted(jobId: number): void {
  const map = readDone();
  map[String(jobId)] = Date.now();
  writeDone(map);
}
export function forgetPrinted(jobId: number): void {
  const map = readDone();
  delete map[String(jobId)];
  writeDone(map);
}
export function printedButUnacked(): number[] {
  return Object.keys(readDone()).map(Number);
}

/* ---- what happened the last time this device tried to print ----
   Shown in the printing settings so staff can see the print fired on a device with no
   devtools. RawBT can only say "handed over"; Cleanter says whether it printed and why not. */
export type PrintAttempt = {
  at: number;
  app: PrintApp;
  /** Undefined for RawBT — the scheme handoff reports nothing back. */
  ok?: boolean;
  /** Cleanter accepted it into its own retry queue rather than printing on the spot. */
  queued?: boolean;
  reason?: 'permission' | 'blocked' | 'unreachable' | 'printer' | 'rejected';
  code?: string;
};
let lastAttempt: PrintAttempt | null = null;
const attemptListeners = new Set<(attempt: PrintAttempt) => void>();
export const getLastPrintAttempt = (): PrintAttempt | null => lastAttempt;
export function recordPrintAttempt(attempt: PrintAttempt): void {
  lastAttempt = attempt;
  attemptListeners.forEach((listen) => listen(attempt));
}
/** Settings subscribes so a test print's outcome lands the moment Cleanter answers. */
export function subscribePrintAttempts(listen: (attempt: PrintAttempt) => void): () => void {
  attemptListeners.add(listen);
  return () => { attemptListeners.delete(listen); };
}

/** Hand pre-built ESC/POS raster bytes to the RawBT app via the rawbt: scheme. */
export function printRasterViaRawBt(escPosBytes: Uint8Array): void {
  fireSchemePrint(`base64,${bytesToBase64(escPosBytes)}`);
  recordPrintAttempt({ at: Date.now(), app: 'rawbt' });
}

/* Counter mode prints the ticket when an order ARRIVES (QR or pad), not when a tap happens —
   and since both printing apps are device-local, exactly one device per branch must own that
   or every tablet on the floor prints a copy. That choice is a fact about the device, so it
   lives in the browser, not the database: the counter tablet flips it on in Branch & printer. */
const STATION_KEY = (branchId: number) => `cafeqr_print_station:${branchId}`;
export function isPrintStation(branchId: number | undefined): boolean {
  if (branchId == null) return false;
  try { return localStorage.getItem(STATION_KEY(branchId)) === '1'; } catch { return false; }
}
export function setPrintStation(branchId: number, on: boolean): void {
  try {
    if (on) localStorage.setItem(STATION_KEY(branchId), '1');
    else localStorage.removeItem(STATION_KEY(branchId));
  } catch { /* ignore */ }
}

/* ---- what the setup guide in Branch & printer needs to know about THIS device ---- */

/** Both printing apps ship for Android only — there is no iOS or desktop build of either.
 *  On anything else the handoff silently does nothing (RawBT) or cannot connect (Cleanter),
 *  which from the browser is indistinguishable from a printer that is simply switched off,
 *  so the guide checks this before anything else. */
export const isAndroidDevice = (): boolean => /android/i.test(navigator.userAgent);

/** Whether a receipt can be printed from THIS device at all, or has to be handed to the
 *  branch's print station instead. Only the platform is knowable from the browser — whether
 *  the app is actually installed is not — so an Android tablet with no printing app still
 *  answers true and fails at the handoff, which is what the setup guide exists to catch.
 *  An iPad or a laptop answers false and is routed to the station, where before it simply
 *  did nothing at all. */
export const canPrintHere = (): boolean => isAndroidDevice() && getPrintApp() !== 'station';
export const RAWBT_PLAY_URL = 'https://play.google.com/store/apps/details?id=ru.a402d.rawbtprinter';

/* Whether this device has printed a receipt that actually reached the printer. With RawBT
   nothing in the browser can tell us that: a missing app, an unpaired printer and an empty
   paper roll all look exactly like a successful handoff, so the only honest signal is the
   owner answering "did paper come out?". Cleanter answers for itself, so its first confirmed
   print sets this. Device-local for the same reason the station flag is — it is a fact about
   this tablet, not about the branch. */
const READY_KEY = (branchId: number) => `cafeqr_print_ready:${branchId}`;
export function isPrinterVerified(branchId: number | undefined): boolean {
  if (branchId == null) return false;
  try { return localStorage.getItem(READY_KEY(branchId)) === '1'; } catch { return false; }
}
export function setPrinterVerified(branchId: number, ok: boolean): void {
  try {
    if (ok) localStorage.setItem(READY_KEY(branchId), '1');
    else localStorage.removeItem(READY_KEY(branchId));
  } catch { /* ignore */ }
}
