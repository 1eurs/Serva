import { pick } from '../../lib/i18n';
import { round3 } from '../../lib/format';
import type { Lang, PublicItem } from '../../lib/types';

/** What a part needs to be drawn and priced — the customer menu's item and the dashboard's both fit. */
type PartLike = Pick<PublicItem, 'id' | 'nameEn' | 'nameAr' | 'price' | 'imageUrl'> & { salePrice?: number | null };

/** One line of what a combo holds: the item and how many of it. */
export interface ComboPart<T extends PartLike = PublicItem> { item: T; count: number }

/**
 * A combo's parts, drawn from the menu already loaded, in the owner's order with repeats folded
 * ("2 × Croissant"). A part missing from this menu (deleted, or kept at another branch) is left
 * out — the server has already marked the combo sold out for it.
 */
export function comboParts<T extends PartLike>(it: { comboItemIds?: number[] | null }, itemsById: Map<number, T>): ComboPart<T>[] {
  const out: ComboPart<T>[] = [];
  for (const id of it.comboItemIds ?? []) {
    const part = itemsById.get(id);
    if (!part) continue;
    const seen = out.find((p) => p.item.id === id);
    if (seen) seen.count += 1;
    else out.push({ item: part, count: 1 });
  }
  return out;
}

export const isCombo = (it: { comboItemIds?: number[] | null }) => (it.comboItemIds?.length ?? 0) > 0;

/** What the parts would cost bought one by one, at today's prices. */
export const separateTotal = (parts: ComboPart<PartLike>[]) =>
  round3(parts.reduce((s, p) => s + (p.item.salePrice ?? p.item.price) * p.count, 0));

/** "Latte + 2× Croissant". */
export const partsLabel = (parts: ComboPart<PartLike>[], lang: Lang) =>
  parts.map((p) => (p.count > 1 ? `${p.count}× ` : '') + pick(p.item, 'name', lang)).join(' + ');

/**
 * The combo's picture when the owner has not shot one: its parts' photos side by side — one
 * fills the frame, two split it, three or more put the first large and the next two stacked.
 * A part with no photo gets the same monogram tile the menu uses. Fills whatever box holds it,
 * so the 82px list thumbnail and the gallery's wide frame both work unchanged.
 */
export function ComboArt({ parts, lang, eager = false }: { parts: ComboPart<PartLike>[]; lang: Lang; eager?: boolean }) {
  const tiles = parts.slice(0, 3);
  return (
    <span className={'c-combo-art n' + tiles.length} aria-hidden="true">
      {tiles.map(({ item }) => (
        <span className={'c-combo-tile' + (item.imageUrl ? '' : ' is-empty')} key={item.id}>
          {item.imageUrl
            ? <img src={item.imageUrl} alt="" decoding="async" loading={eager ? 'eager' : 'lazy'} />
            : <span className="glyph">{pick(item, 'name', lang).charAt(0)}</span>}
        </span>
      ))}
    </span>
  );
}
