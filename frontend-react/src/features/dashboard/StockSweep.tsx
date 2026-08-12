import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useI18n, useT, pick, type Dict } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import type { BaseUnit, StockItemRow } from '../../lib/types';
import './stock.css';

/**
 * The sweep — "you won't run out".
 *
 * Perpetual inventory asks a café to record every gram that leaves the shelf, and it
 * decays: one unlogged spill, one staff latte, one delivery entered tomorrow, and the
 * number is wrong forever. A shop of four people loses that battle in a fortnight, and
 * the day the system hides a drink that is physically sitting there, nobody trusts it
 * again.
 *
 * So this screen does not ask what left. It asks what is there, once a day, and
 * re-anchors. Drift cannot accumulate past one sweep.
 *
 * The interaction is the point. Everywhere else in Serva the gauge REPORTS a level; here
 * it is the input — you drag the fill to where the shelf actually is, and the reorder
 * notch you are dragging past is the same notch you have been reading all week. Setting
 * a level and reading one are the same gesture, so the sweep teaches the rest of the
 * feature.
 *
 * One item per screen, walked in stockroom order (by category), because this is a walk
 * and not a form. Nothing is written until the end: the sweep collects, then commits in
 * one pass, so a half-finished walk leaves no half-corrected shelf.
 */

const DICT: Dict = {
  ar: {
    title: 'جولة الرفوف', of: '{a} من {b}',
    lead: 'امشِ على الرف وقل وش موجود. دقيقة وحدة، والباقي يضبط نفسه.',
    plenty: 'كمية وافرة', lowish: 'قارب ينفد', gone: 'خلص',
    exact: 'أعدّه بالضبط', exactHint: 'أدخل الكمية بالـ{u}',
    parQ: 'كم تخزّن منه لما يكون الرف كامل؟',
    parHint: 'مرة وحدة بس. هذا الرقم يصير سقف المؤشر وأساس التنبيه.',
    parUnit: 'بالـ{u}', parSet: 'اعتمد',
    skip: 'تخطَّ', back: 'رجوع', finish: 'إنهاء الجولة',
    savingErr: 'ما انحفظت الجولة. جرّب مرة ثانية.',
    doneTitle: 'خلصت الجولة', doneCounted: 'صنف تم عدّه', doneOrder: 'يحتاج طلب',
    doneNone: 'ما في شي يحتاج طلب. الرفوف مكفّية.',
    sweepRest: 'امشِ على باقي الأصناف ({n})',
    seeOrder: 'شوف قائمة الطلب', close: 'إغلاق', saving: 'جاري الحفظ…',
    emptyTitle: 'ما في أصناف تنجرد', emptySub: 'أضف اللي تشتريه أول، وبعدها الجولة تصير أسرع طريقة تحدّث بها المخزون.',
    noteSweep: 'جولة الرفوف',
    now: 'المسجّل عندنا', par: 'الرف الكامل',
    orderNote: '«قارب ينفد» و«خلص» يدخّلانه في قائمة الطلب.',
  },
  en: {
    title: 'Shelf sweep', of: '{a} of {b}',
    lead: 'Walk the shelf and say what is there. One minute, and the rest looks after itself.',
    plenty: 'Plenty', lowish: 'Running low', gone: 'Gone',
    exact: 'Count it exactly', exactHint: 'Enter the amount in {u}',
    parQ: 'How much do you keep when this is fully stocked?',
    parHint: 'Asked once. This becomes the top of the gauge and the basis for the alert.',
    parUnit: 'in {u}', parSet: 'Set it',
    skip: 'Skip', back: 'Back', finish: 'Finish sweep',
    savingErr: 'The sweep did not save. Try again.',
    doneTitle: 'Sweep finished', doneCounted: 'items counted', doneOrder: 'to order',
    doneNone: 'Nothing needs ordering. The shelves are covered.',
    sweepRest: 'Sweep the other {n}',
    seeOrder: 'See what to order', close: 'Close', saving: 'Saving…',
    emptyTitle: 'Nothing to sweep yet', emptySub: 'Add what you buy first — after that the sweep is the fastest way to bring stock up to date.',
    noteSweep: 'Shelf sweep',
    now: 'on record', par: 'Full shelf',
    orderNote: 'Running low and Gone both add it to the order list.',
  },
};

const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), s);

const unitWord = (u: BaseUnit): string => (u === 'G' ? 'g' : u === 'ML' ? 'ml' : 'pcs');
/** Pieces are whole things; grams and millilitres carry one decimal. */
const qty = (n: number, u: BaseUnit): string => (u === 'PIECE' ? String(Math.round(n)) : n.toFixed(1));

/** A shelf a barista calls "running low" is around a third full — and that is also where
 *  we put the reorder point for an item that has never had one. */
const LOW_FRACTION = 0.3;

/**
 * Whether to hand a field the keyboard the moment it appears.
 *
 * On a desktop that saves a click. On the phone this screen was built for it is the wrong
 * instinct: the sweep advances item to item, and an input that grabs focus on each one
 * throws the software keyboard up over the controls again and again while somebody is
 * walking a stockroom one-handed. Fields the person opened themselves still focus — that
 * is a request, not an ambush.
 */
const FINE_POINTER = typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(pointer: fine)').matches;

/** How many items one sweep may ask for. Roughly the number of things a café actually
 *  runs out of — beans, milks, cups, lids, syrups, pastries — and short enough that the
 *  walk gets finished, which is the only property of a sweep that matters. */
const CAP = 12;

type Verdict = { itemId: number; quantityBase: number; parBase: number; reorderBase: number };

export default function StockSweep({ branchId, items, queryKey, onClose, onSeeOrders }: {
  branchId?: number;
  items: StockItemRow[];
  queryKey: unknown[];
  onClose: () => void;
  onSeeOrders: () => void;
}) {
  const t = useT(DICT);
  const { lang } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();

  /* A sweep that does not finish is worth nothing, and a café with sixty stock items
     given sixty screens quits somewhere around fifteen. So the walk is capped: the most
     valuable items first — value on the shelf is the honest proxy for "the things that
     hurt when they run out" — then stockroom order within the cap, because that is how
     the shelves are physically walked. The rest are swept when someone asks for them. */
  const [all, setAll] = useState(false);
  const ranked = useMemo(
    () => items
      .filter((i) => !i.archived)
      .sort((a, b) =>
        (b.onHand * Number(b.costPerBaseUnit || 0)) - (a.onHand * Number(a.costPerBaseUnit || 0))),
    [items],
  );
  const queue = useMemo(
    () => (all ? ranked : ranked.slice(0, CAP)).sort((a, b) =>
      (a.category?.trim() || '￿').localeCompare(b.category?.trim() || '￿')
      || pick(a, 'name', lang).localeCompare(pick(b, 'name', lang))),
    [ranked, all, lang],
  );
  const rest = ranked.length - queue.length;

  const [at, setAt] = useState(0);
  const [verdicts, setVerdicts] = useState<Record<number, Verdict>>({});
  const [done, setDone] = useState(false);
  const item = queue[at];

  const commit = useMutation({
    mutationFn: async () => {
      const list = Object.values(verdicts);
      /* Sequential on purpose: each adjust writes a movement and recomputes availability,
         and a café sweep is a dozen items — a burst of parallel writes buys nothing and
         makes a partial failure harder to reason about. */
      for (const v of list) {
        const before = items.find((i) => i.id === v.itemId);
        /* A par level the item never had is part of the verdict: the first sweep is also
           how par and reorder point get set, so nobody has to fill in a levels form. */
        if (before && (before.parLevel == null || before.reorderPoint == null)) {
          await api.patch(`/api/dashboard/stock/items/${v.itemId}/levels`, {
            branchId, parLevelBase: v.parBase, reorderPointBase: v.reorderBase,
          });
        }
        await api.post('/api/dashboard/stock/adjust', {
          branchId, stockItemId: v.itemId, quantityBase: v.quantityBase, note: t('noteSweep'),
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      setDone(true);
    },
    onError: () => toast(t('savingErr')),
  });

  const record = (v: Verdict) => {
    setVerdicts((p) => ({ ...p, [v.itemId]: v }));
    if (at + 1 < queue.length) setAt(at + 1);
    else commit.mutate();
  };

  const counted = Object.keys(verdicts).length;
  const toOrder = Object.values(verdicts).filter((v) => v.quantityBase <= v.reorderBase).length;

  /* Escape closes the sweep; nothing is written until the end, so there is nothing to lose. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-bg stk-sweep-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="stock-page stk-sweep" role="dialog" aria-modal="true" aria-label={t('title')}>

        <header className="stk-sweep-top">
          <div className="stk-sweep-ttl">
            <b>{t('title')}</b>
            {!done && queue.length > 0 && (
              <span className="num">{fill(t('of'), { a: Math.min(at + 1, queue.length), b: queue.length })}</span>
            )}
          </div>
          <button className="stk-sweep-x" onClick={onClose} aria-label={t('close')}>✕</button>
          {/* Progress is real information here: a sweep is a walk with a known length,
              so the rail says how much shelf is left, not how much form is left. */}
          {!done && queue.length > 0 && (
            <div className="stk-sweep-rail" aria-hidden>
              <i style={{ inlineSize: `${(at / queue.length) * 100}%` }} />
            </div>
          )}
        </header>

        {queue.length === 0 ? (
          <div className="stk-sweep-body">
            <p className="stk-empty"><b>{t('emptyTitle')}</b>{t('emptySub')}</p>
          </div>
        ) : done ? (
          <Summary t={t} counted={counted} toOrder={toOrder} rest={all ? 0 : rest}
            onSweepRest={() => { setAll(true); setAt(0); setDone(false); }}
            onClose={onClose} onSeeOrders={() => { onClose(); onSeeOrders(); }} />
        ) : commit.isPending ? (
          <div className="stk-sweep-body center"><div className="spinner" /><p className="stk-sweep-saving">{t('saving')}</p></div>
        ) : (
          <Card key={item.id} t={t} item={item} onRecord={record} />
        )}

        {!done && queue.length > 0 && !commit.isPending && (
          <footer className="stk-sweep-foot">
            <button className="stk-sweep-nav" disabled={at === 0} onClick={() => setAt(at - 1)}>
              ‹ {t('back')}
            </button>
            <p className="stk-sweep-lead">{t('lead')}</p>
            <button className="stk-sweep-nav" onClick={() => (at + 1 < queue.length ? setAt(at + 1) : commit.mutate())}>
              {at + 1 < queue.length ? t('skip') : t('finish')} ›
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
  const word = unitWord(u);

  /* An item with no par has no ceiling to draw a gauge against — drawing one anyway would
     be a lie, so the first sweep asks for the ceiling instead and then never asks again. */
  const [par, setPar] = useState<number | null>(item.parLevel ?? null);
  const [parDraft, setParDraft] = useState('');
  const reorder = item.reorderPoint ?? (par != null ? +(par * LOW_FRACTION).toFixed(3) : 0);

  const [exact, setExact] = useState(false);
  const [exactDraft, setExactDraft] = useState('');

  const send = (quantityBase: number, parBase: number) =>
    onRecord({
      itemId: item.id,
      quantityBase: Math.max(0, +quantityBase.toFixed(3)),
      parBase,
      reorderBase: item.reorderPoint ?? +(parBase * LOW_FRACTION).toFixed(3),
    });

  if (par == null) {
    const n = Number(parDraft);
    return (
      <div className="stk-sweep-body">
        <ItemHead item={item} lang={lang} />
        <div className="stk-sweep-par">
          <p className="stk-sweep-q">{t('parQ')}</p>
          <div className="stk-sweep-parrow">
            <input className="num" type="number" inputMode="decimal" min="0" autoFocus={FINE_POINTER}
              value={parDraft} onChange={(e) => setParDraft(e.target.value)}
              aria-label={fill(t('parUnit'), { u: word })}
              onKeyDown={(e) => { if (e.key === 'Enter' && n > 0) setPar(n); }} />
            <span>{word}</span>
            <button className="stk-sweep-set" disabled={!(n > 0)} onClick={() => setPar(n)}>
              {t('parSet')}
            </button>
          </div>
          <p className="stk-sweep-hint">{t('parHint')}</p>
        </div>
      </div>
    );
  }

  /* What the system currently believes, which is what you are standing at the shelf to
     confirm or correct. Not an input: see the note on the gauge below. */
  const onHand = item.onHand;
  const state = onHand <= 0 ? 'out' : onHand <= reorder ? 'low' : 'ok';

  return (
    <div className="stk-sweep-body">
      <ItemHead item={item} lang={lang} />

      {/* The gauge reads here; it does not set.

          It used to be draggable, and the drag was a dead end: nothing on a touch screen
          could commit the value it produced. Each verdict button sends its own figure,
          Skip records nothing, and only a keyboard Enter on the focused track — or the
          exact-count field — ever submitted a dragged number. So a barista could place
          the fill exactly where the shelf was and have no way to say so.

          One question, one way to answer it. The bar now shows what stock currently
          believes, which is the thing you are standing at the shelf to confirm, and the
          notch still marks the line the answer has to clear. */}
      <div className="stk-sweep-set-wrap">
        <div className="stk-sweep-gauge" data-state={state} role="img"
          aria-label={`${t('now')}: ${qty(onHand, u)} ${word}`}>
          <div className="stk-sweep-fill" style={{ inlineSize: `${clamp(onHand / par) * 100}%` }} />
          <i className="stk-sweep-notch" style={{ insetInlineStart: `${(reorder / par) * 100}%` }} />
        </div>

        <div className="stk-sweep-read">
          <b className="num" data-tone={state}>{qty(onHand, u)}</b>
          <span>{word} · {t('now')}</span>
          <em className="num">{t('par')} {qty(par, u)}</em>
        </div>
      </div>

      {/* The answer. Three taps a barista can give without measuring anything — each one
          a position on the gauge above, so the words and the bar teach each other. */}
      <div className="stk-sweep-verdicts">
        {/* "Plenty" must never write stock DOWN. A shelf can sit above par the morning
            after a delivery, and someone confirming it is full should not be the reason
            the number drops. */}
        <button className="stk-sweep-v" data-tone="ok" onClick={() => send(Math.max(par, item.onHand), par)}>
          <span className="stk-sweep-vbar" data-tone="ok" aria-hidden><i style={{ inlineSize: '100%' }} /></span>
          {t('plenty')}
        </button>
        <button className="stk-sweep-v" data-tone="low" onClick={() => send(reorder, par)}>
          <span className="stk-sweep-vbar" data-tone="low" aria-hidden><i style={{ inlineSize: `${LOW_FRACTION * 100}%` }} /></span>
          {t('lowish')}
        </button>
        <button className="stk-sweep-v" data-tone="out" onClick={() => send(0, par)}>
          <span className="stk-sweep-vbar" data-tone="out" aria-hidden><i style={{ inlineSize: '0%' }} /></span>
          {t('gone')}
        </button>
      </div>
      {/* Said once, in words, rather than flagged live under a bar nobody is dragging. */}
      <p className="stk-sweep-hint">{t('orderNote')}</p>

      {exact ? (
        <div className="stk-sweep-exact">
          <label>
            <span>{fill(t('exactHint'), { u: word })}</span>
            <input className="num" type="number" inputMode="decimal" min="0" autoFocus
              value={exactDraft} onChange={(e) => setExactDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && exactDraft !== '') send(Number(exactDraft), par); }} />
          </label>
          <button className="stk-sweep-set" disabled={exactDraft === ''}
            onClick={() => send(Number(exactDraft), par)}>{t('parSet')}</button>
        </div>
      ) : (
        <button className="stk-sweep-exactlink" onClick={() => { setExact(true); setExactDraft(qty(onHand, u)); }}>
          {t('exact')}
        </button>
      )}
    </div>
  );
}

function ItemHead({ item, lang }: { item: StockItemRow; lang: 'en' | 'ar' }) {
  return (
    <div className="stk-sweep-item">
      <h3>{pick(item, 'name', lang)}</h3>
      {item.category && <span>{item.category}</span>}
    </div>
  );
}

/* ================================================================== payoff */

/**
 * The sweep has to produce something, or it is a chore with no end. What it produces is
 * the order list — the walk turns into the shopping.
 */
function Summary({ t, counted, toOrder, rest, onSweepRest, onClose, onSeeOrders }: {
  t: (k: string) => string; counted: number; toOrder: number; rest: number;
  onSweepRest: () => void; onClose: () => void; onSeeOrders: () => void;
}) {
  return (
    <div className="stk-sweep-body stk-sweep-done">
      <b className="stk-sweep-donettl">{t('doneTitle')}</b>
      <div className="stk-sweep-tally">
        <div><b className="num">{counted}</b><span>{t('doneCounted')}</span></div>
        {toOrder > 0 && <div data-tone="low"><b className="num">{toOrder}</b><span>{t('doneOrder')}</span></div>}
      </div>
      {toOrder > 0 ? (
        <button className="stk-sweep-go" onClick={onSeeOrders}>{t('seeOrder')}</button>
      ) : (
        <>
          <p className="stk-sweep-hint">{t('doneNone')}</p>
          <button className="stk-sweep-go" onClick={onClose}>{t('close')}</button>
        </>
      )}
      {/* Offered only after the walk is already done, so the cap never reads as a limit
          on what the sweep can handle — just on what it asks of you at once. */}
      {rest > 0 && (
        <button className="stk-sweep-exactlink" onClick={onSweepRest}>
          {fill(t('sweepRest'), { n: rest })}
        </button>
      )}
    </div>
  );
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));
