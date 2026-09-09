// The "house card" at the top of the public menu: the café in its own words, above the
// categories, in both layouts.
//
// Stored as restaurant.menuInfoJson — deliberately NOT inside the theme document. The
// theme is paint and gets overwritten wholesale by Quick mix / Reset in the look editor;
// this is the café's content and must survive all of that.
//
// The facts below the note (hours, area, phone, Instagram) are NOT stored here — they are
// read live from the branch and restaurant the owner already filled in, so the card can
// never drift out of date against the profile.

export interface MenuInfo {
  /** the owner's switch — false (or no document at all) means no card */
  show: boolean;
  /** one language per screen: the reader sees one of these, never both */
  noteEn: string;
  noteAr: string;
}

export const DEFAULT_MENU_INFO: MenuInfo = { show: false, noteEn: '', noteAr: '' };

/** Longer than this stops being a house note and starts being an About page. */
export const NOTE_MAX = 240;

/**
 * Parse defensively, exactly like parseCustomTheme: unknown keys ignored, every field
 * falls back to a default, malformed JSON degrades to "no card" rather than throwing on
 * a customer's phone.
 */
export function parseMenuInfo(json?: string | null): MenuInfo {
  if (!json) return DEFAULT_MENU_INFO;
  try {
    const parsed = JSON.parse(json) as Partial<MenuInfo>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return DEFAULT_MENU_INFO;
    const str = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, NOTE_MAX) : '');
    return {
      show: parsed.show === true,
      noteEn: str(parsed.noteEn),
      noteAr: str(parsed.noteAr),
    };
  } catch {
    return DEFAULT_MENU_INFO;
  }
}

export const serializeMenuInfo = (info: MenuInfo): string => JSON.stringify(info);

/** A fact worth a chip on the card: an icon plus the value the owner already entered. */
export interface HouseFact {
  key: 'hours' | 'area' | 'phone' | 'instagram';
  icon: string;
  text: string;
  href?: string;
  /**
   * Force this value to render left-to-right. Times, phone numbers and handles are made
   * only of digits, punctuation and Latin letters — all bidi-neutral or weak — so inside
   * an Arabic (RTL) menu they inherit the paragraph direction and come out reversed:
   * "7:00-23:00" renders as "23:00-7:00", which is not just ugly but wrong opening hours.
   * The address is left unforced: it is real prose and may be written in either script.
   */
  ltr?: boolean;
}

/** Strip the @ and any profile URL down to the handle, so the chip reads as a handle. */
const instagramHandle = (url: string): string => {
  const handle = url.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/\/+$/, '');
  return handle ? '@' + handle : '';
};

const instagramHref = (url: string): string => {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return 'https://instagram.com/' + trimmed.replace(/^@/, '');
};

/**
 * Build the fact chips from what the café has already filled in. Anything blank is simply
 * absent — the card never shows an empty slot or a placeholder, so a half-filled profile
 * still produces a card that looks finished.
 */
export function houseFacts(
  branch?: { address?: string | null; openingHours?: string | null } | null,
  restaurant?: { phone?: string | null; instagramUrl?: string | null } | null,
): HouseFact[] {
  const facts: HouseFact[] = [];
  const hours = branch?.openingHours?.trim();
  if (hours) facts.push({ key: 'hours', icon: '🕖', text: hours, ltr: true });
  const area = branch?.address?.trim();
  if (area) facts.push({ key: 'area', icon: '📍', text: area });
  const phone = restaurant?.phone?.trim();
  if (phone) facts.push({ key: 'phone', icon: '📞', text: phone, href: 'tel:' + phone.replace(/\s+/g, ''), ltr: true });
  const ig = restaurant?.instagramUrl?.trim();
  if (ig) {
    const handle = instagramHandle(ig);
    if (handle) facts.push({ key: 'instagram', icon: '◎', text: handle, href: instagramHref(ig), ltr: true });
  }
  return facts;
}
