import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { useI18n, useT, pick } from '../../../lib/i18n';
import { useToast } from '../../../lib/toast';
import type { BaseUnit, StockItemRow } from '../../../lib/types';
import { DICT } from './copy';
import { aisleLabel } from './aisles';
import { fill, human, qty } from './units';
import './stock.css';

/**
 * Counting the shelf — the habit the whole feature rests on.
 *
 * <p>Perpetual inventory asks a café to record every gram that leaves the shelf, and it
 * decays: one unlogged spill, one staff latte, one delivery entered tomorrow, and the number
 * is wrong for ever. A shop of four people loses that battle in a fortnight, and the day the
 * system hides a drink that is physically sitting there, nobody trusts it again.
 *
 * <p>So this screen does not ask what left. It asks what is there, once a day, and
 * re-anchors. Drift cannot accumulate past one count.
 *
 * <p>One item per screen, walked in stockroom order, because this is a walk and not a form.
 * Nothing is written until the end: it collects, then commits in one pass, so a half-finished
 * walk leaves no half-corrected shelf.
 *
 * <p>It used to be called a sweep. Owners did not know what that was, which is a poor
 * property for the one screen you hand to whoever is closing tonight.
 */

const unitWord = (u: BaseUnit, lang: 'ar' | 'en'): string => (lang === 'ar'
  ? (u === 'G' ? 'جم' : u === 'ML' ? 'مل' : 'حبة')
  : (u === 'G' ? 'g' : u === 'ML' ? 'ml' : 'pcs'));

/** A shelf somebody calls "getting low" is around a third full — and that is also where the
 *  order line goes for an item that has never had one. */
const LOW_FRACTION = 0.3;

/**
 * A third of the full shelf, in a figure the unit can actually hold.
 *
 * <p>Pieces are whole things, so a 24-croissant tray was producing an order line of 14.4
 * croissants — printed back to the owner as the line they are meant to trust. Rounds up,
 * because warning early costs a phone call and warning late costs the morning.
 */
const lowPoint = (par: number, u: BaseUnit): number => {
  const raw = par * LOW_FRACTION;
  return u === 'PIECE' ? Math.max(1, Math.ceil(raw)) : Math.max(0, +raw.toFixed(3));
};

/**
 * A full shelf, guessed from the pack.
 *
 * <p>Asking "how much do you keep when this is fully stocked?" as a number in grams, twelve
 * times over on a first walk, is a blocking form question in the middle of a walk. Nobody
 * knows their full shelf in grams. They do know what they buy, and what you keep is roughly
 * what you buy: two packs is a good enough opening guess, and a guess correctable in place
 * beats a question that has to be answered before anything else can happen.
 */
const PAR_PACKS = 2;
const parGuess = (item: StockItemRow): number =>
  Math.max(1, +((item.purchaseUnitSize || 1) * PAR_PACKS).toFixed(3));

/** How many items one walk may ask for. Roughly what a café actually runs out of — beans,
 *  milk, cups, lids, syrups, pastries — and short enough that the walk gets finished, which
 *  is the only property of a count that matters. */
const CAP = 12;

type Verdict = { itemId: number; quantityBase: number; parBase: number; reorderBase: number };
const clamp = (n: number) => Math.max(0, Math.min(1, n));

export default function CountFlow({ branchId, items, queryKey, onClose, onSeeOrder }: {
  branchId?: number; items: StockItemRow[]; queryKey: unknown[];
  onClose: () => void; onSeeOrder: () => void;
}) {
  const t = useT(DICT);
  const { lang } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();

  /* A walk that does not finish is worth nothing, and a café with sixty items given sixty
     screens quits around fifteen. So it is capped: the most valuable items first — value on
     the shelf is the honest proxy for "the things that hurt when they run out" — then
     stockroom order within the cap. The rest are offered afterwards, as the remainder only. */
  const [phase, setPhase] = useState<'first' | 'rest'>('first');
  const ranked = useMemo(
    () => items.filter((i) => !i.archived).sort((a, b) =>
      (b.onHand * Number(b.costPerBaseUnit || 0)) - (a.onHand * Number(a.costPerBaseUnit || 0))),
    [items],
  );
  const queue = useMemo(
    () => (phase === 'first' ? ranked.slice(0, CAP) : ranked.slice(CAP)).sort((a, b) =>
      (aisleLabel(a.category, lang) || '￿').localeCompare(aisleLabel(b.category, lang) || '￿')
      || pick(a, 'name', lang).localeCompare(pick(b, 'name', lang))),
    [ranked, phase, lang],
  );
  const rest = phase === 'first' ? Math.max(0, ranked.length - CAP) : 0;

  const [at, setAt] = useState(0);
  const [verdicts, setVerdicts] = useState<Record<number, Verdict>>({});
  /* What has already reached the server. A second pass must not re-post the first pass's
     answers: adjust is absolute so the balance would survive, but every item would take a
     second line in the ledger for a count nobody made twice. */
  const [written, setWritten] = useState<number[]>([]);
  const [done, setDone] = useState(false);
  const item = queue[at];

  const commit = useMutation({
    mutationFn: async (list: Verdict[]) => {
      /* Sequential on purpose: each write recomputes availability, and a café count is a
         dozen items — parallel writes buy nothing and make a partial failure harder to
         reason about. */
      for (const v of list) {
        const before = items.find((i) => i.id === v.itemId);
        const parMoved = !before
          || before.parLevel == null || before.reorderPoint == null
          || Number(before.parLevel) !== v.parBase
          || Number(before.reorderPoint) !== v.reorderBase;
        if (parMoved) {
          await api.patch(`/api/dashboard/stock/items/${v.itemId}/levels`, {
            branchId, parLevelBase: v.parBase, reorderPointBase: v.reorderBase,
          });
        }
        /* counted: true is what makes this a count in the ledger rather than a correction,
           and it is what the page reads to say when anybody last looked at a shelf. */
        await api.post('/api/dashboard/stock/adjust', {
          branchId, stockItemId: v.itemId, quantityBase: v.quantityBase,
          note: t('cNote'), counted: true,
        });
      }
      return list.map((v) => v.itemId);
    },
    onSuccess: (ids) => {
      setWritten((p) => [...p, ...ids]);
      qc.invalidateQueries({ queryKey });
      setDone(true);
    },
    onError: () => toast(t('cSaveErr')),
  });

  /** Everything answered that the server has not been told about yet. */
  const pending = (extra?: Verdict) => {
    const all = { ...verdicts, ...(extra ? { [extra.itemId]: extra } : {}) };
    return Object.values(all).filter((v) => !written.includes(v.itemId));
  };

  const record = (v: Verdict) => {
    setVerdicts((p) => ({ ...p, [v.itemId]: v }));
    if (at + 1 < queue.length) setAt(at + 1);
    else commit.mutate(pending(v));
  };

  const counted = Object.keys(verdicts).length;
  const toOrder = Object.values(verdicts).filter((v) => v.quantityBase <= v.reorderBase).length;

  /* Escape closes it; nothing is written until the end, so there is nothing to lose. The page
     behind is frozen — this covers the whole phone, and a shelf scrolling underneath a
     full-screen walk is only ever an accident. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="modal-bg stk-count-scrim"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="stock-page stk-count" role="dialog" aria-modal="true" aria-label={t('jobCount')}>

        <header className="stk-count-top">
          <div className="stk-count-ttl">
            <b>{t('jobCount')}</b>
            {!done && queue.length > 0 && (
              <span className="num">
                {fill(t('cOf'), { a: Math.min(at + 1, queue.length), b: queue.length })}
              </span>
            )}
          </div>
          <button className="stk-count-x" onClick={onClose} aria-label={t('cClose')}>✕</button>
          {/* Progress is real information here: a count is a walk with a known length, so the
              rail says how much shelf is left, not how much form is left. */}
          {!done && queue.length > 0 && (
            <div className="stk-count-rail" aria-hidden>
              <i style={{ inlineSize: `${(at / queue.length) * 100}%` }} />
            </div>
          )}
        </header>

        {queue.length === 0 ? (
          <div className="stk-count-body">
            <p className="stk-empty"><b>{t('cEmpty')}</b>{t('cEmptySub')}</p>
          </div>
        ) : done ? (
          <Summary t={t} counted={counted} toOrder={toOrder} rest={rest}
            onCountRest={() => { setPhase('rest'); setAt(0); setDone(false); }}
            onClose={onClose} onSeeOrder={() => { onClose(); onSeeOrder(); }} />
        ) : commit.isPending ? (
          <div className="stk-count-body center">
            <div className="spinner" /><p className="stk-count-saving">{t('cSaving')}</p>
          </div>
        ) : (
          <Card key={item.id} t={t} item={item} onRecord={record} />
        )}

        {!done && queue.length > 0 && !commit.isPending && (
          <footer className="stk-count-foot">
            <button className="stk-count-nav" disabled={at === 0} onClick={() => setAt(at - 1)}>
              ‹ {t('cBack')}
            </button>
            <p className="stk-count-lead">{t('cLead')}</p>
            <button className="stk-count-nav"
              onClick={() => (at + 1 < queue.length ? setAt(at + 1) : commit.mutate(pending()))}>
              {at + 1 < queue.length ? t('cSkip') : t('cFinish')} ›
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

/* ================================================================== one item */

function Card({ t, item, onRecord }: {
  t: (k: string) => string; item: StockItemRow; onRecord: (v: Verdict) => void;
}) {
  const { lang } = useI18n();
  const u = item.baseUnit;
  const word = unitWord(u, lang);
  /* The ceiling the bar is drawn against, guessed from the pack and correctable in place, so
     the walk starts on the question it exists to ask. Only a field the person opened
     themselves takes focus: an input grabbing the keyboard on each item throws the software
     keyboard over the controls while somebody walks a stockroom one-handed. */
  const [par, setPar] = useState<number>(item.parLevel ?? parGuess(item));
  const [parOpen, setParOpen] = useState(false);
  const [parDraft, setParDraft] = useState('');
  const reorder = item.parLevel != null && par === item.parLevel && item.reorderPoint != null
    ? item.reorderPoint
    : lowPoint(par, u);

  const [exact, setExact] = useState(false);
  const [exactDraft, setExactDraft] = useState('');

  const send = (quantityBase: number, parBase: number) =>
    onRecord({
      itemId: item.id,
      quantityBase: Math.max(0, +quantityBase.toFixed(3)),
      parBase,
      reorderBase: item.parLevel != null && parBase === item.parLevel && item.reorderPoint != null
        ? item.reorderPoint
        : lowPoint(parBase, u),
    });

  const commitPar = () => {
    const n = Number(parDraft);
    if (n > 0) setPar(n);
    setParOpen(false);
  };

  const onHand = item.onHand;
  const state = onHand <= 0 ? 'out' : onHand <= reorder ? 'order' : 'ok';

  return (
    <div className="stk-count-body">
      <div className="stk-count-item">
        <h3>{pick(item, 'name', lang)}</h3>
        {item.category && <span>{aisleLabel(item.category, lang)}</span>}
      </div>

      {/* The bar reads here; it does not set. It shows what stock currently believes — the
          thing you are standing at the shelf to confirm — and the notch is the same order
          line the shelf draws down its whole list, so the two screens teach each other. */}
      <div className="stk-count-set">
        <div className="stk-count-gauge" data-state={state} role="img"
          aria-label={`${t('cNow')}: ${qty(onHand, u)} ${word}`}>
          <div className="stk-count-fill" style={{ inlineSize: `${clamp(onHand / par) * 100}%` }} />
          <i className="stk-count-notch" style={{ insetInlineStart: `${(reorder / par) * 100}%` }} />
        </div>

        <div className="stk-count-read">
          <b className="num" data-tone={state}>{qty(onHand, u)}</b>
          <span>{word} · {t('cNow')}</span>
          {/* The only thing here that is a guess rather than a record — so it says which it is
              and can be corrected without leaving. */}
          <button type="button" className="stk-count-parbtn num" aria-expanded={parOpen}
            onClick={() => { setParDraft(qty(par, u)); setParOpen((o) => !o); }}>
            {t('cPar')} {human(par, u, lang)} <i aria-hidden>✎</i>
          </button>
        </div>
      </div>

      {parOpen && (
        <div className="stk-count-exact">
          <label>
            <span>{t('cParQ')}</span>
            <input className="num" type="number" inputMode="decimal" min="0" autoFocus
              value={parDraft} onChange={(e) => setParDraft(e.target.value)}
              aria-label={fill(t('cParUnit'), { u: word })}
              onKeyDown={(e) => { if (e.key === 'Enter') commitPar(); }} />
          </label>
          <button className="stk-count-set-btn" onClick={commitPar}>{t('cParSet')}</button>
        </div>
      )}

      {/* Three taps somebody can give without measuring anything — each one a position on the
          bar above, so the words and the picture teach each other. Each carries the figure it
          will write: three words alone were a guess the system then recorded as a
          measurement, and an owner tapping "Plenty" had no way to see what that meant. */}
      <div className="stk-count-verdicts">
        {/* "Plenty" must never write stock DOWN. A shelf can sit above par the morning after a
            delivery, and confirming it is full should not be the reason the number drops. */}
        {([
          { tone: 'ok', label: t('cPlenty'), value: Math.max(par, item.onHand), fillPct: 100 },
          { tone: 'order', label: t('cLowish'), value: reorder, fillPct: LOW_FRACTION * 100 },
          { tone: 'out', label: t('cGone'), value: 0, fillPct: 0 },
        ] as const).map((v) => (
          <button key={v.tone} className="stk-count-v" data-tone={v.tone}
            aria-label={`${v.label} — ${human(v.value, u, lang)}`}
            onClick={() => send(v.value, par)}>
            <span className="stk-count-vbar" data-tone={v.tone} aria-hidden>
              <i style={{ inlineSize: `${v.fillPct}%` }} />
            </span>
            <span className="stk-count-vlabel">{v.label}</span>
            <span className="stk-count-vnum num" aria-hidden>{human(v.value, u, lang)}</span>
          </button>
        ))}
      </div>
      <p className="stk-count-hint">{t('cOrderNote')}</p>

      {exact ? (
        <div className="stk-count-exact">
          <label>
            <span>{fill(t('cExactHint'), { u: word })}</span>
            <input className="num" type="number" inputMode="decimal" min="0" autoFocus
              value={exactDraft} onChange={(e) => setExactDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && exactDraft !== '') send(Number(exactDraft), par);
              }} />
          </label>
          <button className="stk-count-set-btn" disabled={exactDraft === ''}
            onClick={() => send(Number(exactDraft), par)}>{t('cParSet')}</button>
        </div>
      ) : (
        <button className="stk-count-exactlink"
          onClick={() => { setExact(true); setExactDraft(qty(onHand, u)); }}>
          {t('cExact')}
        </button>
      )}
    </div>
  );
}

/* ================================================================== payoff */

/** A walk has to produce something, or it is a chore with no end. What it produces is the
 *  order list — the count turns into the shopping. */
function Summary({ t, counted, toOrder, rest, onCountRest, onClose, onSeeOrder }: {
  t: (k: string) => string; counted: number; toOrder: number; rest: number;
  onCountRest: () => void; onClose: () => void; onSeeOrder: () => void;
}) {
  return (
    <div className="stk-count-body stk-count-done">
      <b className="stk-count-donettl">{t('cDone')}</b>
      <div className="stk-count-tally">
        <div><b className="num">{counted}</b><span>{t('cDoneCounted')}</span></div>
        {toOrder > 0 && (
          <div data-tone="order"><b className="num">{toOrder}</b><span>{t('cDoneOrder')}</span></div>
        )}
      </div>
      {toOrder > 0 ? (
        <button className="stk-count-go" onClick={onSeeOrder}>{t('cSeeOrder')}</button>
      ) : (
        <>
          {/* "The shelves are covered" said after a walk in which every item was skipped is
              the most reassuring sentence in the feature over no evidence at all. */}
          <p className="stk-count-hint">{t(counted > 0 ? 'cDoneNone' : 'cDoneNothing')}</p>
          <button className="stk-count-go" onClick={onClose}>{t('cClose')}</button>
        </>
      )}
      {/* Offered only after the walk is done, so the cap never reads as a limit on what
          counting can handle — just on what it asks of you at once. */}
      {rest > 0 && (
        <button className="stk-count-exactlink" onClick={onCountRest}>
          {fill(t('cRest'), { n: rest })}
        </button>
      )}
    </div>
  );
}
