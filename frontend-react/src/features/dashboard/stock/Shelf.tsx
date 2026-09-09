import { useMemo, useState } from 'react';
import { useI18n, pick } from '../../../lib/i18n';
import type { CoverRow, StockItemRow } from '../../../lib/types';
import { aisleLabel } from './aisles';
import { Gauge, Rail, stateLabel } from './parts';
import { LINE_AT, levelOf, qty, unitTag } from './units';
import type { SheetReq } from './StockPage';

type T = (k: string) => string;
type Filter = 'all' | 'below' | 'new';

/**
 * The shelf, and the one idea the whole feature is built on.
 *
 * <p>Every row is a bar measured against that item's own order line, and because the axis is
 * <em>multiples of the line</em> rather than fractions of a full shelf, the line lands in the
 * same column on every row. So it is drawn as one continuous vertical rule running the length
 * of the list — through the aisle headers, past forty items — and everything to the left of
 * it is something to buy. That is the entire reading task: no colour key to remember, no
 * three shades of warning to tell apart, no counts to cross-reference against a chip rail.
 *
 * <p>It also collapses the vocabulary. "Run out", "to order" and "gone tonight" were three
 * words for one decision and three chips to choose between; there is now one word for it,
 * and it names the picture: below the line.
 */
export default function Shelf({ t, items, cover, openSheet }: {
  t: T; items: StockItemRow[]; cover: Map<number, CoverRow>; openSheet: (s: SheetReq) => void;
}) {
  const { lang } = useI18n();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [aisle, setAisle] = useState('');

  /* Keyed on the printed label, not on what is stored: an aisle written "Coffee" before
     aisles had keys and "coffee" after it is one shelf, not two. */
  const aisles = useMemo(
    () => [...new Set(items.map((i) => aisleLabel(i.category, lang)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b)),
    [items, lang],
  );

  const below = items.filter((i) => { const l = levelOf(i); return l === 'out' || l === 'order'; });
  const uncounted = items.filter((i) => levelOf(i) === 'new');

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((i) => {
      if (needle && !`${i.nameEn} ${i.nameAr} ${aisleLabel(i.category, lang)}`
        .toLowerCase().includes(needle)) return false;
      if (aisle && aisleLabel(i.category, lang) !== aisle) return false;
      const l = levelOf(i);
      if (filter === 'below') return l === 'out' || l === 'order';
      if (filter === 'new') return l === 'new';
      return true;
    });
  }, [items, q, aisle, filter, lang]);

  /* Out before below-the-line, then by how close to the line — which is also, exactly, left
     to right along the rule, so the sort order and the picture agree. */
  const byUrgency = (a: StockItemRow, b: StockItemRow) => {
    const rank = (i: StockItemRow) => (levelOf(i) === 'out' ? 0 : 1);
    const gap = (i: StockItemRow) => (i.reorderPoint ? i.onHand / i.reorderPoint : 0);
    return rank(a) - rank(b) || gap(a) - gap(b)
      || pick(a, 'name', lang).localeCompare(pick(b, 'name', lang));
  };
  const byName = (a: StockItemRow, b: StockItemRow) =>
    pick(a, 'name', lang).localeCompare(pick(b, 'name', lang));

  const sifting = filter !== 'all' || !!q.trim() || !!aisle;

  /* Unsifted, the list leads with everything below the line and then falls into stockroom
     order, because that is how the shelves are physically walked. */
  const sections = useMemo(() => {
    if (sifting) return [{ key: 'flat', label: '', rows: [...shown].sort(byUrgency) }];
    const out: { key: string; label: string; rows: StockItemRow[]; alert?: boolean }[] = [];
    const low = shown.filter((i) => { const l = levelOf(i); return l === 'out' || l === 'order'; });
    if (low.length) out.push({ key: 'below', label: t('fBelow'), rows: low.sort(byUrgency), alert: true });

    const rest = shown.filter((i) => levelOf(i) === 'ok');
    const byAisle = new Map<string, StockItemRow[]>();
    for (const i of rest) {
      const k = aisleLabel(i.category, lang) || t('uncategorised');
      (byAisle.get(k) ?? byAisle.set(k, []).get(k)!).push(i);
    }
    for (const [label, rows] of [...byAisle.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      out.push({ key: `a:${label}`, label, rows: rows.sort(byName) });
    }

    /* Last, and named for what it is. An item nobody has counted is not a problem, it is an
       absence of information, and putting it in with the shortages was the page telling an
       owner they had eight emergencies on their first evening. */
    const never = shown.filter((i) => levelOf(i) === 'new');
    if (never.length) out.push({ key: 'new', label: t('grpNew'), rows: never.sort(byName) });
    return out;
  }, [shown, sifting, lang, t]);

  const chips: { f: Filter; label: string; n: number; tone?: string }[] = [
    { f: 'below', label: t('fBelow'), n: below.length, tone: 'below' },
    { f: 'new', label: t('fNew'), n: uncounted.length },
  ];

  return (
    <section className="stk-shelf">
      <div className="stk-shelf-hd">
        <h3>{t('shelf')}</h3>
        <input className="stk-q" type="search" value={q} placeholder={t('search')}
          aria-label={t('search')} onChange={(e) => setQ(e.target.value)} />
        <button className="stk-add" onClick={() => openSheet({ k: 'edit', id: null })}>
          <span aria-hidden>+</span><em>{t('addItem')}</em>
        </button>
      </div>

      <Rail role="group" aria-label={t('filters')}>
        <button className={`stk-chip${filter === 'all' && !aisle ? ' on' : ''}`}
          aria-pressed={filter === 'all' && !aisle}
          onClick={() => { setFilter('all'); setAisle(''); }}>{t('fAll')}</button>
        {chips.filter((c) => c.n > 0 || filter === c.f).map((c) => (
          <button key={c.f} className={`stk-chip${filter === c.f ? ' on' : ''}`} data-tone={c.tone}
            aria-pressed={filter === c.f}
            onClick={() => setFilter(filter === c.f ? 'all' : c.f)}>
            <b className="num">{c.n}</b>{c.label}
          </button>
        ))}
        {aisles.length > 0 && <span className="stk-rail-split" aria-hidden />}
        {aisles.map((a) => (
          <button key={a} className={`stk-chip${aisle === a ? ' on' : ''}`} aria-pressed={aisle === a}
            onClick={() => setAisle(aisle === a ? '' : a)}>{a}</button>
        ))}
      </Rail>

      {shown.length === 0 ? (
        <p className="stk-empty">
          {t('noMatch')}
          <button className="stk-mini"
            onClick={() => { setQ(''); setAisle(''); setFilter('all'); }}>{t('showAll')}</button>
        </p>
      ) : (
        <div className="stk-list">
          {/* The legend: one tick, naming the rule that runs down the list beneath it. It is
              the only place the axis is explained, and it is explained by pointing at it. */}
          <div className="stk-axis" aria-hidden>
            <span className="stk-row-track">
              <i className="stk-row-rule" style={{ insetInlineStart: `${LINE_AT}%` }} />
              <em className="stk-axis-cap" style={{ insetInlineStart: `${LINE_AT}%` }}>
                {t('lineCap')}
              </em>
            </span>
          </div>

          {sections.map((s) => (
            <div className="stk-band" key={s.key}>
              {s.label && (
                <h4 className={`stk-sec-hd${s.alert ? ' alert' : ''}`}>
                  <span className="stk-band-label">{s.label}<i className="num">{s.rows.length}</i></span>
                  {/* The rule carries on through the header, so it is one line down the whole
                      list rather than a stack of unrelated little charts. */}
                  <span className="stk-row-track">
                    <i className="stk-row-rule" style={{ insetInlineStart: `${LINE_AT}%` }} />
                  </span>
                </h4>
              )}
              {s.rows.map((i) => (
                <Row key={i.id} t={t} item={i} cover={cover.get(i.id)}
                  showAisle={s.key === 'below' || s.key === 'flat' || s.key === 'new'}
                  onOpen={() => openSheet({ k: 'item', id: i.id })} />
              ))}
            </div>
          ))}

          <p className="stk-axis-note">{t('axisNote')}</p>
        </div>
      )}
    </section>
  );
}

/**
 * One item. Name, what is there, where it sits against its line, and what that means.
 *
 * <p>The bar is not decoration next to the number — it is the number, placed. The words on
 * the right say the same thing in the unit a decision is made in: days, or "Order", or
 * "Not counted", never a second quantity to reconcile against the first.
 */
function Row({ t, item, cover, showAisle, onOpen }: {
  t: T; item: StockItemRow; cover?: CoverRow; showAisle: boolean; onOpen: () => void;
}) {
  const { lang } = useI18n();
  const state = levelOf(item);
  const label = stateLabel(item, cover, t, lang);
  return (
    <button className="stk-row" data-state={state} onClick={onOpen}>
      <span className="stk-row-name">
        <b>{pick(item, 'name', lang)}</b>
        {showAisle && item.category && <em>{aisleLabel(item.category, lang)}</em>}
      </span>
      <span className="stk-row-qty num">
        {qty(item.onHand, item.baseUnit)}<i>{unitTag(item.baseUnit, t)}</i>
      </span>
      <span className="stk-row-track">
        <i className="stk-row-rule" style={{ insetInlineStart: `${LINE_AT}%` }} />
        <Gauge item={item} rule={false} className="in-row" />
      </span>
      <span className="stk-row-state" data-tone={label.tone}>{label.text}</span>
    </button>
  );
}
