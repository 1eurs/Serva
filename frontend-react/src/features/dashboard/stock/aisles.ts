import type { Lang } from '../../../lib/types';

/**
 * The aisles a café's stockroom actually has.
 *
 * <p>`stock_items.category` is one free-text column, so whatever language the owner had on
 * the day they added an item is the language every later reader gets — Latin section
 * headers down an otherwise Arabic shelf, which is the thing Serva is not allowed to do.
 * There is no second column to write the other name into, so the fix is to stop storing a
 * name: a known aisle is stored as its key and rendered per language from here.
 *
 * <p>Anything else an owner types is their own word for their own shelf and is kept exactly
 * as typed — one language is a property Serva owes its own nouns, not the café's.
 */
export const AISLES = {
  coffee: { en: 'Coffee', ar: 'بن' },
  dairy: { en: 'Dairy', ar: 'ألبان' },
  syrups: { en: 'Syrups', ar: 'شرابات' },
  dry: { en: 'Dry goods', ar: 'مواد جافة' },
  bakery: { en: 'Bakery', ar: 'مخبوزات' },
  drinks: { en: 'Drinks', ar: 'مشروبات' },
  packaging: { en: 'Packaging', ar: 'تغليف' },
} as const;

export type AisleKey = keyof typeof AISLES;

const KEYS = Object.keys(AISLES) as AisleKey[];

/**
 * The key a stored category belongs to, or null when it is the café's own word.
 *
 * <p>Matches the key itself and both names, so rows written before this existed — "Coffee"
 * from an English session, "بن" from an Arabic one — land in the same aisle instead of
 * splitting the shelf in two.
 */
export function aisleKey(raw: string | null | undefined): AisleKey | null {
  const v = (raw ?? '').trim().toLowerCase();
  if (!v) return null;
  return KEYS.find((k) => k === v
    || AISLES[k].en.toLowerCase() === v
    || AISLES[k].ar === (raw ?? '').trim()) ?? null;
}

/** What to print on a shelf header, a chip or a row tag. */
export function aisleLabel(raw: string | null | undefined, lang: Lang): string {
  const key = aisleKey(raw);
  return key ? AISLES[key][lang] : (raw ?? '').trim();
}

/**
 * What to store. A typed word that matches a known aisle becomes its key; anything else is
 * kept verbatim, so an owner who walks a "Freezer" shelf still gets a "Freezer" shelf.
 */
export function aisleStore(typed: string | null | undefined): string | null {
  const v = (typed ?? '').trim();
  if (!v) return null;
  return aisleKey(v) ?? v;
}

/** The usual set, in the reader's language — offered after the café's own aisles. */
export const aisleSuggestions = (lang: Lang): string[] => KEYS.map((k) => AISLES[k][lang]);
