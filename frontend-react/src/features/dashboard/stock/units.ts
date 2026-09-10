import type { BaseUnit, Lang, StockItemRow } from '../../../lib/types';

/**
 * Quantities, packs and the axis the shelf is drawn against.
 *
 * <p>Everything numeric in stock goes through this file, because the feature's whole
 * credibility rests on the same figure reading the same way wherever it appears: on a row,
 * on the count screen, in the message that goes to the supplier. Two spellings of one
 * quantity is how an owner concludes the numbers are made up.
 */

export const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), s);

type T = (k: string) => string;

/* ------------------------------------------------------------------ quantities */

/** Pieces are whole things; grams and millilitres get one decimal. */
export const qty = (n: number | null | undefined, unit?: BaseUnit | null): string => {
  const v = Number(n ?? 0);
  return unit === 'PIECE' ? String(Math.round(v)) : v.toFixed(1);
};

/** The unit as it reads next to a number: "820 g", "٨٢٠ جم", nothing at all for pieces. */
export const unitTag = (u: BaseUnit | null | undefined, t: T): string =>
  (u === 'G' ? t('tagG') : u === 'ML' ? t('tagML') : '');

/**
 * A quantity as a person would say it out loud.
 *
 * <p>The ledger counts in grams and millilitres, which is right for the ledger and wrong for
 * somebody holding the bag: "6000.0 g" is a figure to decode, "6 kg" is the thing in their
 * hand. Anything past a thousand climbs to the bigger unit and drops the decimal noise.
 *
 * <p>Returned as two pieces because the wall sets the figure at four times the size of its
 * unit — one string would make "kg" as loud as the number it qualifies.
 */
export const humanParts = (n: number, u: BaseUnit, lang: Lang): { n: string; u: string } => {
  const small = lang === 'ar'
    ? (u === 'G' ? 'جم' : u === 'ML' ? 'مل' : 'حبة')
    : (u === 'G' ? 'g' : u === 'ML' ? 'ml' : 'pcs');
  const big = lang === 'ar' ? (u === 'G' ? 'كيلو' : 'لتر') : (u === 'G' ? 'kg' : 'L');
  if (u === 'PIECE') return { n: String(Math.round(n)), u: small };
  if (n === 0) return { n: '0', u: small };               // "0.0 g" is a decimal about nothing
  if (Math.abs(n) >= 1000) return { n: String(Number((n / 1000).toFixed(2))), u: big };
  return { n: qty(n, u), u: small };
};

export const human = (n: number, u: BaseUnit, lang: Lang): string => {
  const p = humanParts(n, u, lang);
  return `${p.n} ${p.u}`;
};

/**
 * "day" / "days", and in Arabic the dual as well.
 *
 * <p>Days of cover is the one number on this page an owner reads as a sentence, so getting
 * it wrong is conspicuous. Arabic counts in four bands: one, two, a few (3–10), many.
 */
export const dayWord = (n: number, lang: Lang): string => {
  if (lang !== 'ar') return n === 1 ? 'day' : 'days';
  const mod = n % 100;
  if (n === 1) return 'يوم';
  if (n === 2) return 'يومان';
  return mod >= 3 && mod <= 10 ? 'أيام' : 'يوم';
};

/* ------------------------------------------------------------------ packs */

/**
 * The units a pack is sold in, as they appear on an invoice.
 *
 * <p>Picking one answers both questions the form used to ask separately — what the shelf
 * counts in, and how many of those a pack holds — because "1 kg" already says "1000 grams"
 * to everyone but a form. Owners told us that pair was the hard part; this is the fix, and
 * nothing new is allowed to ask for a base unit again.
 */
export const PACK_UNITS = {
  KG: { base: 'G' as BaseUnit, per: 1000 },
  G: { base: 'G' as BaseUnit, per: 1 },
  L: { base: 'ML' as BaseUnit, per: 1000 },
  ML: { base: 'ML' as BaseUnit, per: 1 },
  PIECE: { base: 'PIECE' as BaseUnit, per: 1 },
} as const;
export type PackUnit = keyof typeof PACK_UNITS;
export const PACK_ORDER: PackUnit[] = ['KG', 'G', 'L', 'ML', 'PIECE'];

/**
 * Items are stored the way the ledger needs them, so editing one has to read the invoice
 * wording back out. 1000 g is the kilo it was typed as; 750 g was never a kilo.
 */
export const packUnitOf = (base: BaseUnit, size: number): PackUnit =>
  base === 'PIECE' ? 'PIECE'
    : size >= 1000 && size % 1000 === 0 ? (base === 'G' ? 'KG' : 'L')
      : (base === 'G' ? 'G' : 'ML');

/**
 * How the pack reads, worked out from what the ledger stores rather than from a label
 * somebody typed once. That label is one string in one language, and this text also goes to
 * the supplier on WhatsApp — an Arabic café was copying "6 × 1 kg bag" into the message.
 */
export const packLabel = (
  baseUnit: BaseUnit | null | undefined, size: number | null | undefined, t: T,
): string => {
  const base = baseUnit ?? 'G';
  const n = Number(size) || 1;
  const unit = packUnitOf(base, n);
  return `${Number((n / PACK_UNITS[unit].per).toFixed(3))} ${t(`u${unit}`)}`;
};

/* ------------------------------------------------------------------ levels */

/**
 * Where an item stands. Four states, and the fourth is the one that keeps the page honest.
 *
 * <p>"Never counted" and "ran out" are not the same news, and only one of them is an alarm.
 * An item added off an invoice this morning has no line and no figure — calling that "out"
 * puts a red number in front of the owner for something that has never been on the shelf,
 * and red numbers that mean nothing are how a screen stops being read.
 */
export type Level = 'out' | 'order' | 'ok' | 'new';

export const levelOf = (i: StockItemRow): Level =>
  (i.counted === false || (i.counted == null && i.parLevel == null && i.reorderPoint == null)
    ? 'new'
    : i.out || i.onHand <= 0 ? 'out'
      : i.low ? 'order'
        : 'ok');

/* ------------------------------------------------------------------ the axis */

/**
 * Where the order line stands, as a percentage of every track on the wall.
 *
 * <p>This is the one number the page's whole shape hangs off. Because it is a constant, the
 * line lands at the same height in every tile and can be read straight across the grid —
 * "not filled up to the line" becomes something you see across forty items without reading
 * a word. It was 34 while the wall was a list and the line ran vertically down it; sitting
 * across a tile it wants to be nearer the middle, or a full shelf has nowhere to grow.
 */
export const LINE_AT = 44;

/**
 * How far along its track a quantity sits.
 *
 * <p>The axis is deliberately not "how full is this shelf". A shelf's fullness is measured
 * against its par, and every item has a different par, so a fill scaled that way puts each
 * item's warning mark at a different height and the wall reads as forty unrelated
 * instruments. The axis here is <em>multiples of your own order line</em>, which is the same
 * quantity for every item — one line's worth is one line's worth — so a single height serves
 * the whole grid and reaching it is the only thing the reader has to see.
 *
 * <p>Above the line the scale compresses: two lines' worth reaches halfway to the end, ten
 * is nearly there, and nothing ever runs off the track. A café stocked for a month must not
 * flatten every other row into an identical full bar.
 *
 * <p>Null when nobody has set a line yet — an item like that gets an empty dashed tile,
 * because there is no honest place to put a fill.
 */
export const axisPct = (onHand: number, orderAt: number | null | undefined): number | null => {
  if (orderAt == null || orderAt <= 0) return null;
  const ratio = Math.max(0, onHand) / orderAt;
  if (ratio <= 1) return ratio * LINE_AT;
  return LINE_AT + (100 - LINE_AT) * (1 - 1 / ratio);
};

/* ------------------------------------------------------------------ presets */

/**
 * What a café buys.
 *
 * <p>Six or seven of these <em>is</em> an opening stock list, so the first items should cost
 * a tap rather than a form each: the preset knows the name in both languages, the aisle, and
 * the pack it comes in. The price is the only thing left to type, because it is the only
 * line on the invoice that is genuinely theirs.
 */
export type Preset = {
  en: string; ar: string; cat: string; unit: PackUnit; amount: number; servings: number | null;
};
export const PRESETS: Preset[] = [
  { en: 'Coffee beans', ar: 'حبوب بن', cat: 'coffee', unit: 'KG', amount: 1, servings: 55 },
  { en: 'Milk', ar: 'حليب', cat: 'dairy', unit: 'L', amount: 1, servings: 6 },
  { en: 'Cups 12oz', ar: 'أكواب ١٢ أونصة', cat: 'packaging', unit: 'PIECE', amount: 50, servings: 50 },
  { en: 'Lids', ar: 'أغطية', cat: 'packaging', unit: 'PIECE', amount: 50, servings: 50 },
  { en: 'Sleeves', ar: 'أكمام', cat: 'packaging', unit: 'PIECE', amount: 50, servings: 50 },
  { en: 'Napkins', ar: 'مناديل', cat: 'packaging', unit: 'PIECE', amount: 100, servings: 100 },
  { en: 'Sugar', ar: 'سكر', cat: 'dry', unit: 'KG', amount: 1, servings: 100 },
  { en: 'Tea bags', ar: 'أكياس شاي', cat: 'dry', unit: 'PIECE', amount: 100, servings: 100 },
  { en: 'Chocolate powder', ar: 'بودرة شوكولاتة', cat: 'dry', unit: 'KG', amount: 1, servings: 40 },
  { en: 'Vanilla syrup', ar: 'شراب فانيلا', cat: 'syrups', unit: 'ML', amount: 750, servings: 25 },
  { en: 'Croissants', ar: 'كرواسون', cat: 'bakery', unit: 'PIECE', amount: 24, servings: 24 },
  { en: 'Water bottles', ar: 'مياه معبأة', cat: 'drinks', unit: 'PIECE', amount: 24, servings: 24 },
];
