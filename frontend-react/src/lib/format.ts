// Money is OMR with 3 decimals everywhere. Never compute VAT on the client for
// display of an order — the server returns vatAmount/total. We only *estimate*
// the cart subtotal/VAT before submission.

export const omr = (n: number | string | null | undefined): string =>
  Number(n ?? 0).toFixed(3);

/** Round to OMR's 3 decimals (mils) using half-up, mirroring the backend's BigDecimal(scale=3, HALF_UP).
 *  Use it on every client money figure before deriving another from it, so the subtotal / VAT / discount /
 *  total lines always reconcile instead of drifting apart by a fil through raw float arithmetic. */
export const round3 = (n: number): number => Math.round((n + Number.EPSILON) * 1000) / 1000;

/** vatRate from the API is a percent (e.g. 5 = 5%). */
export const estimateVat = (subtotal: number, vatRatePercent: number, enabled: boolean): number =>
  enabled ? subtotal * (vatRatePercent / 100) : 0;

/** Whole-number percent off, for a discount badge (e.g. base 3, sale 2.4 → 20). */
export const discountPercent = (base: number, sale: number): number =>
  base > 0 ? Math.round((1 - sale / base) * 100) : 0;

/**
 * Keep phone inputs to what the backend's Phones.normalize accepts: digits
 * (Arabic-Indic converted to Latin) and one leading +. Everything else is
 * dropped as the user types, so a pasted "96-12 34" or "٩٦١٢٣٤" still works.
 */
/**
 * Sanitize a phone <input> and force the element itself back in sync.
 *
 * sanitizePhone alone is not enough for a controlled React input. When the stripped value
 * equals the value already in state, React bails out of the re-render and never writes the
 * DOM node back — so whatever the browser put there stays on screen. Typing letters is
 * fine (React's controlled-input restore catches that), but the two paths that matter on a
 * phone are not: a predictive/IME keyboard commits through composition, and autofill sets
 * .value directly. Both left "call me maybe" sitting in the phone field with empty state,
 * which then failed the car-order phone check while looking filled in.
 */
export const syncPhoneInput = (el: HTMLInputElement): string => syncInput(el, sanitizePhone);

/** The same forcing-back-in-sync, for any field that cleans what was typed or pasted into it. */
export const syncInput = (el: HTMLInputElement, clean: (raw: string) => string): string => {
  const cleaned = clean(el.value);
  if (el.value !== cleaned) el.value = cleaned;
  return cleaned;
};

/**
 * Is this a phone a café could actually ring back?
 *
 * sanitizePhone only strips what is not a digit; it happily returns "+" or "9". That was the
 * whole check on a CAR order, where the phone is the only way to reach a customer sitting
 * outside — so an order could arrive with a one-character number and no way to chase it.
 *
 * Oman mobiles are 8 digits starting 7 or 9, optionally carrying the 968 country code.
 */
export const isValidPhone = (raw: string): boolean => {
  const digits = sanitizePhone(raw).replace(/^\+/, '').replace(/^968/, '');
  return /^[79]\d{7}$/.test(digits);
};

export const sanitizePhone = (raw: string): string => {
  let out = '';
  for (const c of westernDigits(raw)) {
    if (c >= '0' && c <= '9') out += c;
    else if (c === '+' && out === '') out += c;
  }
  return out.slice(0, 16);
};

/**
 * What a copy-paste smuggles into a credential field.
 *
 * A login travels here by message — the admin sends the owner a username and password, the
 * owner sends staff theirs. Copied out of a right-to-left message it arrives wrapped in bidi
 * marks or isolates; copied off a web page it arrives with a non-breaking space. Nothing on
 * screen shows any of it, and trim() removes none of it (JS trim knows about the space, not
 * about U+200F), so the field looks exactly right and the login is refused — which reads to
 * the person typing it as a wrong password.
 *
 * The backend cleans the same characters out of what it stores and what it looks up
 * (Pasted.java); this is here so the field on screen shows what will actually be sent.
 */
const INVISIBLE = /[\u00ad\u061c\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g;
const ODD_SPACE = /[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g;

/** Arabic-Indic (٠-٩) and extended Arabic-Indic (۰-۹) digits as 0-9 — an Arabic keyboard's
 *  number row types the former, so "mutrah2" gets entered as "mutrah٢". */
export const westernDigits = (raw: string): string =>
  raw.replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (d) => {
    const code = d.charCodeAt(0);
    return String.fromCharCode(48 + code - (code >= 0x06f0 ? 0x06f0 : 0x0660));
  });

/** A username or an email: anything the server matches by equality. */
export const cleanIdentifier = (raw: string): string =>
  westernDigits(raw.replace(INVISIBLE, '').replace(ODD_SPACE, ' ')).trim();

/** A login. An identifier that additionally cannot hold a space anywhere — the field that
 *  took "countre muscat" is the reason this whole file grew a cleaning section. */
export const cleanLogin = (raw: string): string => cleanIdentifier(raw).replace(/\s+/g, '');

/** A password. Only the invisible characters go: a space may have been chosen on purpose,
 *  and an Arabic digit in a password is just a character. Nothing visible is touched. */
export const cleanSecret = (raw: string): string => raw.replace(INVISIBLE, '');

/** A 6-digit one-time code, however it was typed or pasted in. */
export const cleanOtp = (raw: string): string =>
  westernDigits(raw).replace(/\D/g, '').slice(0, 6);

export const fmtElapsed = (sinceIso: string | number): string => {
  const ms = Date.now() - (typeof sinceIso === 'number' ? sinceIso : new Date(sinceIso).getTime());
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * The ISO calendar date (YYYY-MM-DD) of {@code d} in the cafés' operating timezone
 * (Asia/Muscat, UTC+04:00, no DST). The backend buckets analytics by Oman local
 * day, so date params sent to the API must be Oman-local dates — NOT UTC dates.
 * {@code new Date().toISOString().slice(0,10)} would return the UTC date, which is
 * 4 hours behind Oman and would cut the "today" window short (and roll early-morning
 * orders into yesterday). Oman has no DST, so a fixed +4h offset is always correct.
 */
const MUSCAT_OFFSET_MS = 4 * 60 * 60 * 1000;
export const omanDate = (d: Date = new Date()): string =>
  new Date(d.getTime() + MUSCAT_OFFSET_MS).toISOString().slice(0, 10);

/** Current hour (0-23) in Oman local time — for the "now" marker on the hourly chart. */
export const omanHour = (d: Date = new Date()): number =>
  new Date(d.getTime() + MUSCAT_OFFSET_MS).getUTCHours();

/** The date and time on a receipt, identical on every device that prints it.
 *
 * toLocaleString() reads the device's own locale, so one order printed from a counter tablet
 * and from the print station came out "9/8/2026, 2:13:46 AM" and "٨‏/٩‏/٢٠٢٦، ٢:١٣:٤٦ ص" —
 * different digits, and the day and month swapped. A slip is a VAT document; which tablet
 * happened to print it cannot change the date on it. Assembled from parts rather than Intl so
 * it cannot drift between an Android WebView's ICU and a desktop Chrome's either, and so the
 * digits match every other number on the slip, which are Latin throughout.
 *
 * Local time on purpose: the café's own clock is the one the order was taken on.
 */
const RECEIPT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const receiptDateTime = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(d.getDate())} ${RECEIPT_MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
