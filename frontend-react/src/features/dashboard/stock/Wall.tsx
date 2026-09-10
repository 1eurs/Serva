import { useMemo } from 'react';
import { useI18n, pick } from '../../../lib/i18n';
import type { CoverRow, StockItemRow } from '../../../lib/types';
import { aisleLabel } from './aisles';
import { stateLabel } from './parts';
import { LINE_AT, axisPct, humanParts, levelOf } from './units';

type T = (k: string) => string;

/**
 * The wall — every tin, bag and sleeve the café owns, all of it on one screen.
 *
 * <p>What owners kept saying about the list this replaces was not that it was wrong, it was
 * that it was a <em>reading task</em>: forty rows of name, figure, bar and verdict, scanned
 * left to right, forty times, to answer a question they had asked by walking into the
 * stockroom and looking at a shelf. A shelf is not read. It is seen.
 *
 * <p>So an item is a tile that fills the way the thing it stands for fills — up from the
 * bottom — and one dashed line crosses every tile at exactly the same height. That line is
 * the order line. A tile filled past it is fine; a tile that has not reached it wants
 * buying. The whole grid answers "what do I need?" before a single word is read, and the
 * words are there for the second look rather than the first.
 *
 * <p>The height is a constant on purpose (see {@link axisPct}): the fill is drawn in
 * multiples of that item's <em>own</em> order line, never as a fraction of a full shelf, so
 * a kilo of beans and four hundred cups reach the line at the same place. Scaling a tile to
 * its par instead would put every tile's mark at a different height and the wall would go
 * back to being forty little charts — which is the reading task, drawn prettier.
 *
 * <p>Positions are stable: sorted by aisle, then by name, and nothing reorders as stock
 * moves. Somebody who has used this for a week finds milk by knowing where milk is, and a
 * grid that resorts itself under them takes that away in exchange for a ranking the
 * waterline already gives for free.
 */
export default function Wall({ t, items, cover, q, onOpen, onNew }: {
  t: T; items: StockItemRow[]; cover: Map<number, CoverRow>;
  /** The live search text, owned by the page so the empty state can offer to create it. */
  q: string;
  onOpen: (id: number) => void;
  onNew: (name: string) => void;
}) {
  const { lang } = useI18n();

  const { counted, uncounted } = useMemo(() => {
    const byName = (a: StockItemRow, b: StockItemRow) =>
      pick(a, 'name', lang).localeCompare(pick(b, 'name', lang));
    /* Aisle first, so the coffee things stand together and the packaging stands together —
       which is how a stockroom is walked and therefore how the grid is scanned. It is the
       only structure here: no headers, no chips, no bands. The order does the work and
       spends no pixels saying so. */
    const sorted = [...items].sort((a, b) =>
      aisleLabel(a.category, lang).localeCompare(aisleLabel(b.category, lang)) || byName(a, b));
    return {
      counted: sorted.filter((i) => levelOf(i) !== 'new'),
      /* An item nobody has counted has no figure and no fill, so it would punch a hole in
         the wall wherever it landed. Held back in its own band and named for what it is:
         missing information, not a shortage. */
      uncounted: sorted.filter((i) => levelOf(i) === 'new'),
    };
  }, [items, lang]);

  if (items.length === 0) {
    const typed = q.trim();
    return (
      <p className="stk-nothing">
        <b>{typed ? `“${typed}”` : t('noMatch')}</b>
        <span>{typed ? t('noMatchSub') : ''}</span>
        {typed && (
          <button className="stk-mini key" onClick={() => onNew(typed)}>
            {t('addNamed').replace('{name}', typed)}
          </button>
        )}
      </p>
    );
  }

  return (
    <div className="stk-wall-wrap">
      <div className="stk-wall">
        {counted.map((i) => (
          <Tile key={i.id} t={t} item={i} cover={cover.get(i.id)} onOpen={() => onOpen(i.id)} />
        ))}
      </div>

      {uncounted.length > 0 && (
        <>
          <h3 className="stk-band-h">
            {t('grpNew')}<i className="num">{uncounted.length}</i>
          </h3>
          <div className="stk-wall">
            {uncounted.map((i) => (
              <Tile key={i.id} t={t} item={i} cover={cover.get(i.id)} onOpen={() => onOpen(i.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * One tile — a container with something in it.
 *
 * <p>The figure is said the way the person holding the bag says it: "6 kg", not "6000.0 g".
 * The unit is set small beside it because it qualifies the number rather than competing
 * with it, and because a wall of tiles where every unit shouts is a wall nobody scans.
 *
 * <p>Three layers, bottom to top: the fill, the waterline, the words. The words never sit
 * on a saturated colour — the fill is a wash — so the tile stays readable at every level,
 * including the one that matters most, which is nearly empty.
 */
function Tile({ t, item, cover, onOpen }: {
  t: T; item: StockItemRow; cover?: CoverRow; onOpen: () => void;
}) {
  const { lang } = useI18n();
  const state = levelOf(item);
  const label = stateLabel(item, cover, t, lang);
  const pct = axisPct(item.onHand, item.reorderPoint);
  const amount = humanParts(item.onHand, item.baseUnit, lang);

  return (
    <button className="stk-tile" data-state={state} data-noline={pct == null || undefined}
      onClick={onOpen}>
      {/* No order line set means no honest height to fill to, so the tile is left as an
          empty dashed outline rather than drawn off a number nobody gave. */}
      {pct != null && (
        <>
          <span className="stk-tile-fill" style={{ blockSize: `${pct}%` }} aria-hidden />
          <i className="stk-tile-water" style={{ insetBlockEnd: `${LINE_AT}%` }} aria-hidden />
        </>
      )}
      <span className="stk-tile-name">{pick(item, 'name', lang)}</span>
      <span className="stk-tile-qty">
        {state === 'new' ? (
          <b className="stk-tile-none" aria-hidden>—</b>
        ) : (
          <>
            <b className="num">{amount.n}</b>
            <i>{amount.u}</i>
          </>
        )}
      </span>
      <span className="stk-tile-state" data-tone={label.tone}>{label.text}</span>
    </button>
  );
}
