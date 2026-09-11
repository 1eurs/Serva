import type { Lang, StockItemRow, StockUnit } from '../../../lib/types';

/**
 * Quantities, and the axis the wall is drawn against.
 *
 * <p>Everything numeric on this feature goes through here, because its credibility rests on
 * one figure reading the same way everywhere it appears — on a tile, in the sheet, in the
 * line that says what it will be after a delivery. Two spellings of one quantity is how an
 * owner concludes the numbers are made up.
 */

export const UNITS: StockUnit[] = ['KG', 'G', 'L', 'ML', 'PIECE'];

/** The unit as a word beside a number. Short, because it qualifies the figure, not competes. */
export const unitWord = (u: StockUnit, lang: Lang): string => (lang === 'ar'
  ? { KG: 'كيلو', G: 'جم', L: 'لتر', ML: 'مل', PIECE: 'حبة' }[u]
  : { KG: 'kg', G: 'g', L: 'L', ML: 'ml', PIECE: 'pcs' }[u]);

/**
 * A figure as a person would say it out loud.
 *
 * <p>Trailing zeros are noise on a shelf — "12.000 L" is a figure to decode, "12 L" is what is
 * in the fridge. Pieces are whole things and never carry a decimal at all; you cannot have
 * half a cup.
 */
export const qty = (n: number | null | undefined, unit: StockUnit): string => {
  const v = Number(n ?? 0);
  if (unit === 'PIECE') return String(Math.round(v));
  return String(Number(v.toFixed(2)));
};

/** The figure and its unit as two pieces — the tile sets one twice the size of the other. */
export const parts = (n: number | null | undefined, unit: StockUnit, lang: Lang) =>
  ({ n: qty(n, unit), u: unitWord(unit, lang) });

/**
 * Where an item stands. Four answers, and the fourth is what keeps the wall honest.
 *
 * <p>"Nobody has set an order line" and "you have run out" are not the same news, and only
 * one of them is an alarm. An item added off an invoice this morning has no line to be under;
 * colouring it red would put a warning in front of an owner about something that was never
 * on the shelf, and warnings that mean nothing are how a screen stops being read.
 */
export type Level = 'ok' | 'order' | 'out' | 'noline';

export const levelOf = (i: StockItemRow): Level => {
  if (i.reorderPoint == null) return 'noline';
  if (Number(i.quantity) <= 0) return 'out';
  return Number(i.quantity) <= Number(i.reorderPoint) ? 'order' : 'ok';
};

/**
 * Where the order line sits, as a percentage of every tile on the wall.
 *
 * <p>This constant is what the page's whole shape hangs off. Because the line is at the same
 * height in every tile, it can be read straight across the grid: "not filled up to the line"
 * becomes something seen across forty items without reading a word.
 */
export const LINE_AT = 44;

/**
 * How full a tile draws.
 *
 * <p>Deliberately not "how full is this shelf". Fullness would be measured against some
 * target, every item has a different one, and a fill scaled that way puts each item's warning
 * mark at a different height — forty unrelated little charts. The axis here is multiples of
 * the item's OWN order line, which is the same quantity for every item: one line's worth is
 * one line's worth. So a kilo of beans and four hundred cups reach the mark at the same place.
 *
 * <p>Above the line the scale compresses — two lines' worth reaches halfway to the top, ten is
 * nearly there, nothing ever overflows. A café stocked for a month must not flatten every
 * other tile into an identical full block.
 *
 * <p>Null when there is no line yet: no honest place to put a fill.
 */
export const axisPct = (quantity: number, reorderPoint: number | null | undefined): number | null => {
  if (reorderPoint == null || reorderPoint <= 0) return null;
  const ratio = Math.max(0, quantity) / reorderPoint;
  if (ratio <= 1) return ratio * LINE_AT;
  return LINE_AT + (100 - LINE_AT) * (1 - 1 / ratio);
};

/** What the whole shelf is worth, for the owners who bothered with prices. */
export const shelfValue = (items: StockItemRow[]): number => items.reduce(
  (sum, i) => sum + (i.unitPrice ? Number(i.quantity) * Number(i.unitPrice) : 0), 0);

/**
 * What a café buys.
 *
 * <p>Six or seven of these <em>is</em> an opening stock list, so the first items should cost a
 * tap rather than a form each. The preset knows the name in both languages and the unit it is
 * counted in; how much is there is the only thing genuinely theirs to say.
 */
export type Preset = { en: string; ar: string; unit: StockUnit; packSize?: number; packUnit?: StockUnit };
export const PRESETS: Preset[] = [
  /* Counted the way the fridge is read — in bottles — and told what a bottle holds, so a
     recipe can pour millilitres from it on day one. */
  { en: 'Milk', ar: 'حليب', unit: 'PIECE', packSize: 1, packUnit: 'L' },
  { en: 'Coffee beans', ar: 'حبوب بن', unit: 'KG' },
  { en: 'Cups', ar: 'أكواب', unit: 'PIECE' },
  { en: 'Lids', ar: 'أغطية', unit: 'PIECE' },
  { en: 'Sugar', ar: 'سكر', unit: 'KG' },
  { en: 'Tea bags', ar: 'أكياس شاي', unit: 'PIECE' },
  { en: 'Vanilla syrup', ar: 'شراب فانيلا', unit: 'PIECE', packSize: 750, packUnit: 'ML' },
  { en: 'Napkins', ar: 'مناديل', unit: 'PIECE' },
];

/**
 * How long ago, in the roughness people actually speak in.
 *
 * <p>Used for "Counted 2 hours ago", which is what the figure's credibility rests on. More
 * precision would be false comfort: nobody counts a shelf to the minute.
 */
export const agoWords = (iso: string | null | undefined, lang: Lang): string | null => {
  if (!iso) return null;
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) {
    return lang === 'ar'
      ? (mins < 5 ? 'قبل شوي' : `قبل ${mins} دقيقة`)
      : (mins < 5 ? 'just now' : `${mins} min ago`);
  }
  const hrs = Math.round(mins / 60);
  if (hrs < 24) {
    return lang === 'ar'
      ? (hrs === 1 ? 'قبل ساعة' : hrs === 2 ? 'قبل ساعتين' : `قبل ${hrs} ساعات`)
      : `${hrs} ${hrs === 1 ? 'hour' : 'hours'} ago`;
  }
  const days = Math.round(hrs / 24);
  if (days === 1) return lang === 'ar' ? 'أمس' : 'yesterday';
  // Arabic counts in bands: one, two, a few (3–10), many.
  const dayWord = lang === 'ar'
    ? (days === 2 ? 'يومين' : days <= 10 ? 'أيام' : 'يوم')
    : 'days';
  return lang === 'ar' ? `قبل ${days} ${dayWord}` : `${days} ${dayWord} ago`;
};

/** "day" / "days" — and in Arabic the dual as well, plus the 3–10 plural. */
export const daysWord = (n: number, lang: Lang): string => {
  if (lang !== 'ar') return n === 1 ? 'day' : 'days';
  if (n === 1) return 'يوم';
  if (n === 2) return 'يومين';
  return n >= 3 && n <= 10 ? 'أيام' : 'يوم';
};

/** The ×1000 pair a unit belongs to, smaller first because "18 g" is how a recipe is spoken. */
const family = (u: StockUnit): StockUnit[] =>
  u === 'KG' || u === 'G' ? ['G', 'KG'] : u === 'L' || u === 'ML' ? ['ML', 'L'] : ['PIECE'];

/** What one piece holds, when a tin has said. */
type Tin = { unit: StockUnit; packSize?: number | null; packUnit?: StockUnit | null };
const packOf = (tin: Tin): { size: number; unit: StockUnit } | null =>
  tin.unit === 'PIECE' && tin.packUnit && tin.packSize && tin.packSize > 0
    ? { size: tin.packSize, unit: tin.packUnit } : null;

/**
 * The units a recipe may be written in against a tin: the tin's own family — and, for a tin
 * counted in pieces that has said what a piece holds, the contents' family first, because a
 * latte is written in millilitres and nobody writes "0.2 bottles".
 */
export const recipeUnitsFor = (tin: Tin): StockUnit[] => {
  const pack = packOf(tin);
  return pack ? [...family(pack.unit), 'PIECE'] : family(tin.unit);
};

/** Multiply a quantity in `from` by this to express it in the tin's own unit; null when it can't. */
export const unitFactor = (from: StockUnit, tin: Tin): number | null => {
  const direct = pairFactor(from, tin.unit);
  if (direct != null) return direct;
  const pack = packOf(tin);
  if (!pack) return null;
  const intoPack = pairFactor(from, pack.unit);
  return intoPack == null ? null : intoPack / pack.size;
};

const pairFactor = (from: StockUnit, to: StockUnit): number | null => {
  if (from === to) return 1;
  if (from === 'G' && to === 'KG') return 0.001;
  if (from === 'KG' && to === 'G') return 1000;
  if (from === 'ML' && to === 'L') return 0.001;
  if (from === 'L' && to === 'ML') return 1000;
  return null;
};

/** The units a piece may be said to hold: a weight or a volume, never more pieces. */
export const PACK_UNITS: StockUnit[] = ['L', 'ML', 'KG', 'G'];
