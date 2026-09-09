/* Cleanter (https://cleanter.cleancode.id) — the second app Serva can hand a receipt to,
   next to RawBT (see printer.ts for how the two are chosen per device).

   Where RawBT is reached through a fire-and-forget rawbt: URL that reports nothing back,
   Cleanter runs a small HTTP server on the tablet itself (localhost:9100) and ANSWERS: a
   print is either printed, or refused with a named reason and a fix sentence. That is the
   whole point of offering it — the setup guide can show the real state of the chain instead
   of asking the owner whether paper came out. The trade: it drives Bluetooth Classic
   printers only, so WiFi/LAN printers stay on RawBT.

   Chrome's Local Network Access rules shape everything here. A public https:// page reaching
   localhost needs a permission the cashier grants once — but Chrome only SHOWS the prompt
   for a request made inside a tap. A request made without a gesture while the state is still
   "prompt" is refused silently and the refusal sticks, so nothing in this module talks to the
   bridge on its own until the permission reads granted: the first contact is always the
   Connect button in Branch & printer. Older Chromes have no such permission and the query
   throws, which counts as "no gate". Cleanter answers the older Private Network Access
   preflight itself (1.1.0+), so no proxy or plain-http fallback is needed. */

export const CLEANTER_URL = 'http://localhost:9100';
export const CLEANTER_PLAY_URL = 'https://play.google.com/store/apps/details?id=id.cleancode.cleanter';

/** Cleanter's paper widths: 80mm prints 48 columns / 576 dots, 58mm prints 32 / 384. */
export type PaperWidth = 80 | 58;

export type LnaState = 'granted' | 'denied' | 'prompt' | 'unsupported';

/** Chrome's answer to "may this site reach apps on this device?" — `unsupported` on browsers
 *  that have no such permission, which behave as if it were granted. */
export async function lnaState(): Promise<LnaState> {
  // A page served from loopback is already inside the address space it is reaching, and
  // Chrome asks nothing for that (a dev server, the screenshot harness) — no gate to wait on.
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return 'unsupported';
  try {
    const status = await navigator.permissions.query({ name: 'local-network-access' as PermissionName });
    return status.state;
  } catch {
    return 'unsupported';
  }
}

/* "prompt" from the permission API does not always mean a prompt is coming: Chromes that
   expose the permission but do not yet gate localhost (measured: Chrome 140 answers "prompt"
   and then lets the request through untouched) would leave printing switched off forever if
   we waited for "granted". So the device remembers that a tapped Connect once got an answer
   out of Cleanter, and from then on calls made without a tap are allowed to try. */
const LINKED_KEY = 'cafeqr_cleanter_linked';
export function isCleanterLinked(): boolean {
  try { return localStorage.getItem(LINKED_KEY) === '1'; } catch { return false; }
}
function markLinked(): void {
  try { localStorage.setItem(LINKED_KEY, '1'); } catch { /* ignore */ }
}

/** Whether a call made without a tap may go out right now — the gate the settings poll and
 *  every print sit behind. */
export async function cleanterReachable(): Promise<boolean> {
  const state = await lnaState();
  return state === 'granted' || state === 'unsupported' || (state === 'prompt' && isCleanterLinked());
}

export type CleanterPrinter = { connected: boolean; name?: string; address?: string; problem?: string | null };
export type CleanterHealth = { version: string; printer: CleanterPrinter };

/** Why a call did not end in a print. `permission` and `blocked` are Chrome (code `prompt`
 *  = never asked on this device, `denied` = answered Block), `unreachable` is the app (not
 *  installed / not running), `printer` carries Cleanter's own error code and copy, and
 *  `rejected` is a payload Cleanter would not take. */
export type CleanterFailure = {
  ok: false;
  reason: 'permission' | 'blocked' | 'unreachable' | 'printer' | 'rejected';
  code?: string;
  detail?: string;
  fix?: string;
  status?: number;
};
export type CleanterResult<T> = ({ ok: true } & T) | CleanterFailure;

const HEALTH_TIMEOUT_MS = 2_500;
// /print waits for the printer, and a tall raster over Bluetooth SPP takes a few seconds.
const PRINT_TIMEOUT_MS = 30_000;
// While the permission dialog is up the request stays pending until the cashier answers it
// (measured by Cleanter's authors at ~24s), so a gesture-backed call gets a human budget.
const PROMPT_TIMEOUT_MS = 90_000;
// A prompt Chrome actually drew takes seconds to answer. A refusal faster than this while the
// state still reads "prompt" means no dialog appeared: the origin is embargoed (the prompt was
// once closed with the X), and only a permissions reset in site settings brings it back.
const EMBARGO_MS = 400;

async function call<T extends object>(
  path: string, init: RequestInit, opts: { gesture: boolean; timeoutMs: number },
): Promise<CleanterResult<T>> {
  const before = await lnaState();
  if (before === 'denied') return { ok: false, reason: 'permission', code: 'denied' };
  if (before === 'prompt' && !opts.gesture && !isCleanterLinked()) return { ok: false, reason: 'permission', code: 'prompt' };

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), before === 'prompt' ? PROMPT_TIMEOUT_MS : opts.timeoutMs);
  const started = performance.now();
  let res: Response;
  try {
    res = await fetch(CLEANTER_URL + path, { ...init, signal: controller.signal });
  } catch {
    const elapsed = performance.now() - started;
    const after = await lnaState();
    if (after === 'denied') return { ok: false, reason: 'permission', code: 'denied' };
    if (opts.gesture && before === 'prompt' && elapsed < EMBARGO_MS) return { ok: false, reason: 'blocked' };
    return { ok: false, reason: 'unreachable' };
  } finally {
    window.clearTimeout(timer);
  }

  let body: Record<string, unknown> = {};
  try { body = await res.json(); } catch { /* an empty or non-JSON body is still an answer */ }
  if (res.ok) {
    markLinked();
    return { ok: true, ...(body as T) } as CleanterResult<T>;
  }
  const code = typeof body.error === 'string' ? body.error : undefined;
  const detail = typeof body.detail === 'string' ? body.detail : undefined;
  if (res.status === 503) {
    return { ok: false, reason: 'printer', status: 503, code, detail, fix: typeof body.fix === 'string' ? body.fix : undefined };
  }
  return { ok: false, reason: 'rejected', status: res.status, code, detail };
}

/** Is Cleanter running, and is a printer answering? `gesture: true` only from a tap — that
 *  is the one call allowed to make Chrome show its permission prompt. */
export function cleanterHealth(opts: { gesture: boolean }): Promise<CleanterResult<CleanterHealth>> {
  return call<CleanterHealth>('/health', { method: 'GET' }, { gesture: opts.gesture, timeoutMs: HEALTH_TIMEOUT_MS });
}

type JobReply = { status?: string; jobId?: string };

/** Print one already-binarized receipt image. Never asks for permission (see module note):
 *  a device that has not connected yet gets a `permission` failure and a pointer to the
 *  setup guide. `queue` sends it to Cleanter's own retry queue — for prints nobody is
 *  standing next to (a ticket arriving in counter mode), so a printer that is off or out
 *  of range catches up by itself instead of losing the ticket. */
export async function cleanterPrintImage(
  pngBase64: string,
  opts: { reference: string; paperWidth: PaperWidth; queue: boolean },
): Promise<CleanterResult<{ queued: boolean; jobId?: string }>> {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cut: true,
      paperWidth: opts.paperWidth,
      reference: opts.reference.slice(0, 64),
      // The canvas is already pure black/white, so dithering could only add noise.
      content: [{ type: 'image', base64: pngBase64, align: 'center', dither: false }],
    }),
  };
  const budget = { gesture: false, timeoutMs: PRINT_TIMEOUT_MS };
  if (opts.queue) {
    const queued = await call<JobReply>('/jobs', init, budget);
    if (queued.ok) return { ok: true, queued: true, jobId: queued.jobId };
    // /jobs arrived in Cleanter 1.3.0; an older build answers 404 and still prints via /print.
    if (queued.status !== 404) return queued;
  }
  const printed = await call<JobReply>('/print', init, budget);
  return printed.ok ? { ok: true, queued: false, jobId: printed.jobId } : printed;
}

/* ---- copy ----
   One line for a toast, a paragraph for the setup guide. Keyed by our reason + Cleanter's
   error code rather than passing Cleanter's English `fix` through, so the Arabic dashboard
   stays Arabic; the English one may show Cleanter's own sentence for a code we don't know. */

type Lang = 'ar' | 'en';
type Copy = { short: string; long: string };

const PRINTER_CODES: Record<string, Record<Lang, Copy>> = {
  bluetooth_disabled: {
    en: { short: 'Bluetooth is off', long: 'Bluetooth is switched off on this device. Turn it on and try again.' },
    ar: { short: 'Bluetooth مطفأ', long: 'Bluetooth مطفأ على هذا الجهاز. شغّله وأعد المحاولة.' },
  },
  bluetooth_permission_missing: {
    en: { short: 'Cleanter needs Bluetooth permission', long: 'Cleanter was not allowed to use Bluetooth. Open Cleanter and grant it.' },
    ar: { short: 'Cleanter يحتاج إذن Bluetooth', long: 'لم يُسمح لـ Cleanter باستخدام Bluetooth. افتح Cleanter وامنحه الإذن.' },
  },
  printer_not_connected: {
    en: { short: 'No printer selected in Cleanter', long: 'No printer is selected inside Cleanter. Open Cleanter and pick your paired printer as the default.' },
    ar: { short: 'لا طابعة مختارة في Cleanter', long: 'لا توجد طابعة مختارة داخل Cleanter. افتح Cleanter واختر طابعتك المربوطة كطابعة افتراضية.' },
  },
  printer_not_paired: {
    en: { short: 'Printer is no longer paired', long: 'The selected printer is no longer paired with this device. Pair it again in Android’s Bluetooth settings.' },
    ar: { short: 'الطابعة لم تعد مربوطة', long: 'الطابعة المختارة لم تعد مربوطة بهذا الجهاز. اربطها مجدداً من إعدادات Bluetooth في أندرويد.' },
  },
  printer_unreachable: {
    en: { short: 'Printer is not answering', long: 'The printer did not answer. Check it is switched on, in range, and has paper.' },
    ar: { short: 'الطابعة لا تستجيب', long: 'الطابعة لم تستجب. تأكد أنها مشغّلة وقريبة وفيها ورق.' },
  },
};

const REASONS: Record<string, Record<Lang, Copy>> = {
  unreachable: {
    en: { short: 'Cleanter is not running', long: 'Cleanter is not running on this device, or Chrome has stopped letting Serva reach it. Open Cleanter once so its server starts, then tap Connect in step 4. If it is not installed, go back to step 2.' },
    ar: { short: 'Cleanter لا يعمل', long: 'تطبيق Cleanter لا يعمل على هذا الجهاز، أو توقف Chrome عن السماح لـ Serva بالوصول إليه. افتح Cleanter مرة واحدة ليبدأ خادمه، ثم اضغط «اتصال» في الخطوة 4. إن لم يكن مثبتاً فارجع إلى الخطوة 2.' },
  },
  'permission:prompt': {
    en: { short: 'Connect the printer app first', long: 'Serva has not been allowed to reach Cleanter on this device yet. Tap Connect in step 4 and choose Allow.' },
    ar: { short: 'اربط تطبيق الطباعة أولاً', long: 'لم يُسمح لـ Serva بعد بالوصول إلى Cleanter على هذا الجهاز. اضغط «اتصال» في الخطوة 4 واختر السماح.' },
  },
  'permission:denied': {
    en: { short: 'Chrome blocked the printer app', long: 'Chrome is not letting Serva reach apps on this device. In Chrome, tap the icon left of the address bar → Permissions → switch “Apps on device” on, then tap Connect again.' },
    ar: { short: 'Chrome منع تطبيق الطباعة', long: 'Chrome لا يسمح لـ Serva بالوصول إلى التطبيقات على هذا الجهاز. في Chrome اضغط الأيقونة بجانب شريط العنوان ثم «الأذونات» وفعّل «التطبيقات على الجهاز»، ثم اضغط «اتصال» مرة أخرى.' },
  },
  blocked: {
    en: { short: 'Chrome blocked the printer app', long: 'Chrome’s permission prompt was closed without an answer, and it now refuses silently. In Chrome, tap the icon left of the address bar → Permissions → Reset permissions, then tap Connect again.' },
    ar: { short: 'Chrome منع تطبيق الطباعة', long: 'أُغلقت نافذة إذن Chrome دون إجابة، فصار يرفض بصمت. في Chrome اضغط الأيقونة بجانب شريط العنوان ثم «الأذونات» ثم «إعادة تعيين الأذونات»، ثم اضغط «اتصال» مرة أخرى.' },
  },
  rejected: {
    en: { short: 'Cleanter refused the receipt', long: 'Cleanter would not accept this receipt. Update Cleanter from Google Play and try again.' },
    ar: { short: 'Cleanter رفض الفاتورة', long: 'لم يقبل Cleanter هذه الفاتورة. حدّث Cleanter من Google Play وأعد المحاولة.' },
  },
  printer: {
    en: { short: 'Printer problem', long: 'Cleanter reported a problem it could not fix by itself.' },
    ar: { short: 'مشكلة في الطابعة', long: 'أبلغ Cleanter عن مشكلة لم يستطع حلها بنفسه.' },
  },
};

export function describeCleanterFailure(f: CleanterFailure, lang: Lang): Copy {
  if (f.reason === 'printer') {
    const known = f.code ? PRINTER_CODES[f.code] : undefined;
    if (known) return known[lang];
    // English UI may borrow Cleanter's own sentence for a code newer than this list.
    if (lang === 'en' && f.fix) return { short: REASONS.printer.en.short, long: f.fix };
    return REASONS.printer[lang];
  }
  if (f.reason === 'permission') return REASONS[f.code === 'denied' ? 'permission:denied' : 'permission:prompt'][lang];
  return REASONS[f.reason][lang];
}

/** The same copy for a printer that answers /health but reports a `problem`. */
export function describePrinterProblem(code: string, lang: Lang): Copy {
  return describeCleanterFailure({ ok: false, reason: 'printer', code }, lang);
}
