import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { useI18n, useT, pick } from '../../../lib/i18n';
import { Money } from '../../../lib/Money';
import type { StockItemRow } from '../../../lib/types';
import { DICT, fill } from './copy';
import { ItemForm, ItemSheet } from './sheets';
import { LINE_AT, PRESETS, axisPct, levelOf, parts, shelfValue, type Level, type Preset } from './units';
import './stock.css';

type T = (k: string) => string;

const STATE_WORD: Record<Level, string> = {
  ok: 'stOk', order: 'stOrder', out: 'stOut', noline: 'stNoLine',
};

/**
 * Stock — the wall.
 *
 * <p>One idea carries the screen: an item is a container with something in it. Every item is a
 * tile that fills from the bottom, and one dashed order line crosses every tile at exactly the
 * same height. A tile filled past the line is fine; a tile that has not reached it wants
 * buying. So the grid answers "what do I need?" before a single word is read, and the words
 * are there for the second look rather than the first.
 *
 * <p>That shared height is only honest because the fill is scaled in multiples of each item's
 * OWN order line (see {@link axisPct}), never as a fraction of a full shelf — a kilo of beans
 * and four hundred cups reach the mark at the same place. Scaling each tile to its own target
 * instead would put every mark at a different height, and the wall would go back to being
 * forty little charts to read one at a time.
 *
 * <p>Positions are stable: sorted by name, and nothing reorders as stock moves. Somebody who
 * has used this for a week finds milk by knowing where milk is, and a grid that resorts itself
 * under their thumb takes that away in exchange for a ranking the fills already give for free.
 */
export default function StockPage({ branchId }: { branchId?: number }) {
  const t = useT(DICT);
  const { lang } = useI18n();
  const queryKey = ['stock', branchId];

  const { data: items = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => api.get<StockItemRow[]>(`/api/branches/${branchId}/stock`),
    enabled: !!branchId,
  });

  const [q, setQ] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [form, setForm] = useState<
    { item: StockItemRow | null; seedName?: string; preset?: Preset | null } | null>(null);

  const sorted = useMemo(
    () => [...items].sort((a, b) => pick(a, 'name', lang).localeCompare(pick(b, 'name', lang))),
    [items, lang]);

  const toBuy = useMemo(
    () => items.filter((i) => { const l = levelOf(i); return l === 'order' || l === 'out'; }).length,
    [items]);

  /* The filter goes inert once nothing is low — topping up the last short item takes the chip
     off the row, and a filter still hiding the whole shelf with no control left to turn it off
     is a page that looks broken at the exact moment the owner has just fixed everything. */
  const filtering = onlyLow && toBuy > 0;
  const needle = q.trim().toLowerCase();
  const shown = sorted.filter((i) => {
    if (filtering) { const l = levelOf(i); if (l !== 'order' && l !== 'out') return false; }
    if (!needle) return true;
    return `${i.nameEn ?? ''} ${i.nameAr ?? ''}`.toLowerCase().includes(needle);
  });

  const value = shelfValue(items);
  const open = openId != null ? items.find((i) => i.id === openId) ?? null : null;

  return (
    <div className="tables-wrap stock-page">
      <div className="stk-top">
        <input className="stk-search" type="search" value={q} placeholder={t('search')}
          onChange={(e) => setQ(e.target.value)} aria-label={t('search')} />

        {/* The one filter, and it is the question the page exists to answer. It only appears
            when there is something to answer it with. */}
        {toBuy > 0 && (
          <button className={`stk-tobuy${filtering ? ' on' : ''}`} aria-pressed={filtering}
            onClick={() => setOnlyLow((p) => !p)}>
            {filtering ? t('showAll') : fill(t('toBuy'), { n: toBuy })}
          </button>
        )}

        <button className="btn stk-new" onClick={() => setForm({ item: null })}>＋ {t('add')}</button>
      </div>

      {/* No branch yet means the shell is still resolving which shop this is, and the query has
          not run. Saying "nothing on the shelf" there would flash an empty-stockroom screen at
          an owner whose stockroom is full. */}
      {isLoading || !branchId ? (
        <p className="stk-msg">{t('loading')}</p>
      ) : items.length === 0 ? (
        <FirstRun t={t} onPick={(preset) => setForm({ item: null, preset })} />
      ) : shown.length === 0 ? (
        <Nothing t={t} q={q.trim()} onAdd={() => setForm({ item: null, seedName: q.trim() })} />
      ) : (
        <>
          <div className="stk-wall">
            {shown.map((i) => <Tile key={i.id} t={t} item={i} onOpen={() => setOpenId(i.id)} />)}
          </div>

          {/* Quiet, and last. It is the payoff for having typed prices in, not a headline —
              nobody opens a stock page to read a valuation. */}
          {value > 0 && (
            <p className="stk-value">{t('value')} <Money value={value} /></p>
          )}
        </>
      )}

      {open && (
        <ItemSheet t={t} item={open} queryKey={queryKey}
          onClose={() => setOpenId(null)}
          onEdit={() => { setOpenId(null); setForm({ item: open }); }} />
      )}
      {form && (
        <ItemForm t={t} branchId={branchId} queryKey={queryKey}
          item={form.item} seedName={form.seedName} seedPreset={form.preset}
          onClose={() => setForm(null)} />
      )}
    </div>
  );
}

/**
 * One tile — a container with something in it.
 *
 * <p>The figure is said the way the person holding the bag says it: "6 kg", not "6.000". The
 * unit sits small beside it because it qualifies the number rather than competing with it, and
 * because a wall where every unit shouts is a wall nobody scans.
 *
 * <p>Three layers, bottom to top: the fill, the order line, the words. The words never sit on
 * a saturated colour — the fill is a wash — so a tile stays readable at every level, including
 * the one that matters most, which is nearly empty.
 */
function Tile({ t, item, onOpen }: { t: T; item: StockItemRow; onOpen: () => void }) {
  const { lang } = useI18n();
  const state = levelOf(item);
  const pct = axisPct(Number(item.quantity), item.reorderPoint);
  const amount = parts(item.quantity, item.unit, lang);
  const name = pick(item, 'name', lang);
  const word = t(STATE_WORD[state]);

  return (
    /* The label always names the state, including the "fine" the tile leaves unsaid: a
       screen reader has no fill to look at, and colour was never the only channel here —
       height against the line is. */
    <button className="stk-tile" data-state={state} onClick={onOpen}
      aria-label={`${name} — ${amount.n} ${amount.u} — ${word}`}>
      {/* No order line means no honest height to fill to, so the tile is left an empty dashed
          outline rather than drawn off a number nobody gave. */}
      {pct != null && (
        <>
          <span className="stk-fill" style={{ blockSize: `${pct}%` }} aria-hidden />
          <i className="stk-water" style={{ insetBlockEnd: `${LINE_AT}%` }} aria-hidden />
        </>
      )}
      <span className="stk-name">{name}</span>
      <span className="stk-qty">
        <b className="num">{amount.n}</b>
        <i>{amount.u}</i>
      </span>
      {/* Only the tiles wanting something speak. A wall where every healthy tile also reads
          "Fine" spends its words on the items that need none. */}
      <span className="stk-state" data-tone={state}>{state === 'ok' ? '' : word}</span>
    </button>
  );
}

/**
 * An empty shelf is the one screen where the page knows more than the owner does.
 *
 * <p>Seven of these tapped in a row <em>is</em> an opening stock list, so the first items cost
 * a tap rather than a form each: the starter knows the name in both languages and the unit it
 * is counted in, which leaves the owner only the part that is genuinely theirs to say.
 */
function FirstRun({ t, onPick }: { t: T; onPick: (p: Preset) => void }) {
  const { lang } = useI18n();
  return (
    <div className="stk-first">
      <h3>{t('emptyT')}</h3>
      <p>{t('emptyS')}</p>
      <div className="stk-seeds">
        {PRESETS.map((p) => (
          <button key={p.en} className="stk-seed" onClick={() => onPick(p)}>{p[lang]}</button>
        ))}
      </div>
    </div>
  );
}

/** Searched for something the café does not stock — the most specific moment for adding it. */
function Nothing({ t, q, onAdd }: { t: T; q: string; onAdd: () => void }) {
  return (
    <div className="stk-none">
      <b>{q ? fill(t('noMatchT'), { q }) : t('emptyT')}</b>
      {q && <span>{t('noMatchS')}</span>}
      {q && <button className="btn sm" onClick={onAdd}>{fill(t('addNamed'), { q })}</button>}
    </div>
  );
}
