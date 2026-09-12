import { useMemo, useState } from 'react';
import { Money } from '../../lib/Money';
import { Ltr, useT, type Dict } from '../../lib/i18n';
import type { PaymentTender } from '../../lib/types';

/**
 * Dividing one bill between cash and card.
 *
 * Lives on its own because two screens settle a bill: the live board, where an order already
 * exists and a Collect tap pays it, and the order pad, where the order is still being built
 * and the shares travel with it. Both hand it the same normalised lines and take back the
 * same tenders, so however the split was made, what lands in the ledger is one payment row
 * per method — which is the only shape the till and the cash-vs-card report can count.
 *
 * Two ways in, one answer. The first version asked the counter to say how many people were
 * at the table and who had what, and cafés said what they actually needed was smaller: this
 * coffee was card, the rest was cash. So the default is now BY ITEM — two wallets, Cash and
 * Card, and you tap what went into each. Nobody is counted. The "how does each person pay"
 * step is gone, because the wallet you are tapping into IS the method. Splitting by person is
 * still here for the table that wants its own bills, one switch away, and the tablet
 * remembers which one its counter uses.
 *
 * It carries its own strings rather than taking a `t` prop, so a second screen cannot adopt
 * it and quietly ship a half-translated split.
 */

/** One line of the bill, in the reader's language, as either screen can describe it. */
export interface SplitLine {
  /** Stable within one bill — the cart line key, or the order item id. */
  key: string;
  /** Already language-picked by the caller, options included, so two different Lattes read apart. */
  name: string;
  qty: number;
  /** What the whole line costs. Its units divide it evenly. */
  lineTotal: number;
}

type Tender = 'CASH' | 'CARD';
type Mode = 'items' | 'people';

const MAX_PEOPLE = 12;
/** Which way this tablet's counter splits. A per-device habit, not a café setting. */
const MODE_KEY = 'serva_split_mode';

/** One orderable unit: a line of quantity three becomes three of these, each assignable. */
interface Unit { id: string; weight: number }

const DICT: Dict = {
  ar: {
    modeItems: 'حسب الصنف', modePeople: 'حسب الشخص',
    paidWith: 'دُفع بـ', tapItems: 'اضغط على ما دُفع بهذه الطريقة', wholeLine: 'السطر كله',
    restCash: 'الباقي نقداً', restCard: 'الباقي بطاقة',
    splitWho: 'الإضافة إلى', splitPerson: 'شخص', splitMore: 'إضافة شخص', splitFewer: 'إزالة شخص',
    splitItems: 'من طلب ماذا؟', splitTake: 'لـ',
    splitLeft: 'لم تُوزّع', splitReady: 'وُزّعت كل الأصناف', splitPick: 'اختر طريقة الدفع لكل شخص',
    splitSettle: 'تسجيل الدفع',
    paymentCash: 'نقداً', paymentCard: 'بطاقة / فيزا', back: 'رجوع',
  },
  en: {
    modeItems: 'By item', modePeople: 'By person',
    paidWith: 'Paid with', tapItems: 'Tap what was paid this way', wholeLine: 'Whole line',
    restCash: 'The rest → Cash', restCard: 'The rest → Card',
    splitWho: 'Adding to', splitPerson: 'Person', splitMore: 'Add a person', splitFewer: 'Remove a person',
    splitItems: 'Who had what?', splitTake: 'to',
    splitLeft: 'Not assigned', splitReady: 'Every item assigned', splitPick: 'Choose how each person pays',
    splitSettle: 'Record payment',
    paymentCash: 'Cash', paymentCard: 'Card / Visa', back: 'Back',
  },
};

/**
 * Give each share its slice of the bill in whole baisa, in proportion to its weight, summing
 * to the bill exactly.
 *
 * The weights are item money; the total is what the customer actually owes — VAT, a discount
 * and a redeemed reward included. Scaling one onto the other, rather than adding tax per
 * share, is what keeps the shares adding to a figure the server will accept whatever the café
 * has switched on: {@code settleSplit} rejects a split that misses the total by one baisa.
 * The rounding remainder goes to the largest fractions first, so nobody is over-charged by
 * more than a baisa and the bill is never short at all.
 */
export function shareOut(totalBaisa: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (totalBaisa * w) / sum);
  const out = exact.map(Math.floor);
  let left = totalBaisa - out.reduce((a, b) => a + b, 0);
  for (const { i } of exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)) {
    if (left <= 0) break;
    out[i] += 1;
    left -= 1;
  }
  return out;
}

const readMode = (): Mode => {
  try { return localStorage.getItem(MODE_KEY) === 'people' ? 'people' : 'items'; } catch { return 'items'; }
};
const rememberMode = (mode: Mode) => {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* a private tab forgets; fine */ }
};

/** A line of quantity n, as n tappable units sharing its money evenly. */
const unitsOf = (lines: SplitLine[]) => new Map(lines.map((l) => {
  const n = Math.max(1, l.qty);
  return [l.key, Array.from({ length: n }, (_, i): Unit => ({ id: `${l.key}#${i}`, weight: l.lineTotal / n }))];
}));

type T = (k: string) => string;

export function SplitBill({ total, lines, busy, onSettle, onBack }: {
  total: number; lines: SplitLine[]; busy: boolean;
  onSettle: (tenders: PaymentTender[]) => void; onBack: () => void;
}) {
  const t = useT(DICT);
  const [mode, setMode] = useState<Mode>(readMode);
  const pick = (m: Mode) => { setMode(m); rememberMode(m); };
  const totalBaisa = Math.round(total * 1000);
  const units = useMemo(() => unitsOf(lines), [lines]);

  return (
    <div className="split">
      <div className="seg split-modes" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'items'} className={mode === 'items' ? 'on' : ''}
          disabled={busy} onClick={() => pick('items')}>{t('modeItems')}</button>
        <button type="button" role="tab" aria-selected={mode === 'people'} className={mode === 'people' ? 'on' : ''}
          disabled={busy} onClick={() => pick('people')}>{t('modePeople')}</button>
      </div>
      {/* key= so switching starts the other mode clean rather than carrying half a split across */}
      {mode === 'items'
        ? <ByItem key="items" t={t} totalBaisa={totalBaisa} lines={lines} units={units} busy={busy} onSettle={onSettle} onBack={onBack} />
        : <ByPerson key="people" t={t} totalBaisa={totalBaisa} lines={lines} units={units} busy={busy} onSettle={onSettle} onBack={onBack} />}
    </div>
  );
}

interface ModeProps {
  t: T; totalBaisa: number; lines: SplitLine[]; units: Map<string, Unit[]>; busy: boolean;
  onSettle: (tenders: PaymentTender[]) => void; onBack: () => void;
}

/* ============================ BY ITEM ============================
   Two wallets. Pick one, tap what went into it. The amounts under the wallets are the
   tenders, live, so the counter can read "card 3.000" back to the customer before anything
   is recorded — and because they are shares of the real total, VAT is already in them. */
function ByItem({ t, totalBaisa, lines, units, busy, onSettle, onBack }: ModeProps) {
  const allUnits = useMemo(() => [...units.values()].flat(), [units]);
  const [active, setActive] = useState<Tender>('CASH');
  /** unit id → how it was paid. Absent means nobody has said yet. */
  const [paid, setPaid] = useState<Record<string, Tender>>({});

  const claim = (id: string) => setPaid((prev) => {
    const next = { ...prev };
    if (next[id] === active) delete next[id]; else next[id] = active;
    return next;
  });
  /** The line's name is a target too: three waters that were all card is one tap, not three. */
  const claimLine = (key: string) => setPaid((prev) => {
    const ids = (units.get(key) ?? []).map((u) => u.id);
    const allMine = ids.every((id) => prev[id] === active);
    const next = { ...prev };
    for (const id of ids) { if (allMine) delete next[id]; else next[id] = active; }
    return next;
  });
  /** "These two were card, everything else cash" — the shape of most real splits. */
  const rest = (method: Tender) => setPaid((prev) => {
    const next = { ...prev };
    for (const u of allUnits) if (next[u.id] === undefined) next[u.id] = method;
    return next;
  });

  const left = allUnits.filter((u) => paid[u.id] === undefined);
  const weightOf = (m: Tender) => allUnits.reduce((sum, u) => sum + (paid[u.id] === m ? u.weight : 0), 0);
  // The unclaimed pile rides along as one more weight, so a wallet always reads as its true
  // slice of the real bill while tapping is still going on rather than swelling to fill it.
  const [cashBaisa, cardBaisa] = shareOut(totalBaisa, [weightOf('CASH'), weightOf('CARD'), left.reduce((s, u) => s + u.weight, 0)]);

  const tenders: PaymentTender[] = [
    ...(cashBaisa > 0 ? [{ method: 'CASH' as const, amount: cashBaisa / 1000 }] : []),
    ...(cardBaisa > 0 ? [{ method: 'CARD' as const, amount: cardBaisa / 1000 }] : []),
  ];
  const ready = !left.length && tenders.length > 0;

  const wallet = (m: Tender, glyph: string, label: string, baisa: number) => (
    <button type="button" className={'split-wallet ' + m.toLowerCase() + (active === m ? ' on' : '')}
      disabled={busy} aria-pressed={active === m} onClick={() => setActive(m)}>
      <span className="split-wallet-ic" aria-hidden="true">{glyph}</span>
      <span className="split-wallet-lb">{label}</span>
      <span className="split-wallet-amt num"><Money value={baisa / 1000} /></span>
    </button>
  );

  return (
    <>
      <div className="split-label split-items-lb">{t('paidWith')}</div>
      <div className="split-wallets">
        {wallet('CASH', '💵', t('paymentCash'), cashBaisa)}
        {wallet('CARD', '▣', t('paymentCard'), cardBaisa)}
      </div>

      <div className="split-label split-items-lb">{t('tapItems')}</div>
      <div className="split-items">
        {lines.map((l) => (
          <div className="split-item" key={l.key}>
            <button type="button" className="split-item-nm split-line-btn" disabled={busy}
              title={t('wholeLine')} onClick={() => claimLine(l.key)}>{l.name}</button>
            <div className="split-units">
              {(units.get(l.key) ?? []).map((u) => {
                const m = paid[u.id];
                return (
                  <button key={u.id} type="button" className={'split-unit' + (m ? ' ' + m.toLowerCase() : '')}
                    disabled={busy} onClick={() => claim(u.id)}
                    aria-pressed={m === active}
                    aria-label={`${l.name} · ${m ? t(m === 'CASH' ? 'paymentCash' : 'paymentCard') : t('splitLeft')}`}>
                    {m === 'CASH' ? '💵' : m === 'CARD' ? '▣' : '·'}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className={'split-left' + (left.length ? '' : ' ok')} aria-live="polite">
        <span>{left.length ? t('splitLeft') : t('splitReady')}</span>
        {left.length ? <span className="num"><Ltr>{left.length}</Ltr></span> : <span aria-hidden="true">✓</span>}
      </div>
      {left.length > 0 && (
        <div className="split-rest">
          <button type="button" className="btn sm ghost" disabled={busy} onClick={() => rest('CASH')}>{t('restCash')}</button>
          <button type="button" className="btn sm ghost" disabled={busy} onClick={() => rest('CARD')}>{t('restCard')}</button>
        </div>
      )}

      <button className="btn split-settle" disabled={busy || !ready} onClick={() => onSettle(tenders)}>
        {t('splitSettle')}
      </button>
      <button className="btn ghost payment-cancel" disabled={busy} onClick={onBack}>{t('back')}</button>
    </>
  );
}

/* ============================ BY PERSON ============================
   The original: say how many people, tap who had what, then say how each of them pays. Kept
   for the table that wants separate bills — it is the same taps as above with people in the
   place of wallets, plus the one extra step the wallets made unnecessary. */
function ByPerson({ t, totalBaisa, lines, units, busy, onSettle, onBack }: ModeProps) {
  const allUnits = useMemo(() => [...units.values()].flat(), [units]);

  const [people, setPeople] = useState(2);
  const [active, setActive] = useState(0);
  /** unit id → the person holding it. Absent means nobody has claimed it yet. */
  const [owner, setOwner] = useState<Record<string, number>>({});
  const [methods, setMethods] = useState<(Tender | null)[]>([null, null]);

  const claim = (id: string) => setOwner((prev) => {
    const next = { ...prev };
    if (next[id] === active) delete next[id]; else next[id] = active;
    return next;
  });

  const setCount = (n: number) => {
    const next = Math.min(MAX_PEOPLE, Math.max(2, n));
    if (next === people) return;
    if (next < people) {
      // Whatever the departing people were holding goes back on the table, not onto someone
      // else's bill — and the settle button stays dead until somebody claims it.
      setOwner((prev) => Object.fromEntries(Object.entries(prev).filter(([, p]) => p < next)));
      setMethods((prev) => prev.slice(0, next));
      setActive((a) => Math.min(a, next - 1));
    } else {
      setMethods((prev) => [...prev, ...Array<Tender | null>(next - prev.length).fill(null)]);
    }
    setPeople(next);
  };

  const left = allUnits.filter((u) => owner[u.id] === undefined);
  const weights = [
    ...Array.from({ length: people }, (_, p) =>
      allUnits.reduce((sum, u) => sum + (owner[u.id] === p ? u.weight : 0), 0)),
    left.reduce((sum, u) => sum + u.weight, 0),
  ];
  const shares = shareOut(totalBaisa, weights);
  const owed = shares.slice(0, people);

  const tenders: PaymentTender[] = owed.flatMap((baisa, p) =>
    baisa > 0 && methods[p] ? [{ method: methods[p]!, amount: baisa / 1000 }] : []);
  // Somebody who ate nothing owes nothing and is not asked how they are paying.
  const unpicked = owed.some((baisa, p) => baisa > 0 && !methods[p]);
  const ready = !left.length && !unpicked && tenders.length > 0;

  const pay = (p: number, method: Tender) =>
    setMethods((prev) => prev.map((m, i) => (i === p ? (m === method ? null : method) : m)));

  return (
    <>
      <div className="split-head">
        <span className="split-label">{t('splitWho')}</span>
        <div className="split-chips">
          {Array.from({ length: people }, (_, p) => (
            <button key={p} className={'split-chip num' + (p === active ? ' on' : '')}
              disabled={busy} aria-pressed={p === active}
              aria-label={`${t('splitPerson')} ${p + 1}`}
              onClick={() => setActive(p)}><Ltr>{p + 1}</Ltr></button>
          ))}
          <button className="split-chip more" disabled={busy || people <= 2}
            title={t('splitFewer')} aria-label={t('splitFewer')}
            onClick={() => setCount(people - 1)}>−</button>
          <button className="split-chip more" disabled={busy || people >= MAX_PEOPLE}
            title={t('splitMore')} aria-label={t('splitMore')}
            onClick={() => setCount(people + 1)}>＋</button>
        </div>
      </div>

      {/* Tap a unit to put it on the chosen person's bill; tap it again to take it back.
          A unit already on someone else's bill moves across in one tap — a mis-tap on a busy
          counter should cost one tap to undo, not two. */}
      <div className="split-label split-items-lb">{t('splitItems')}</div>
      <div className="split-items">
        {lines.map((l) => (
          <div className="split-item" key={l.key}>
            <span className="split-item-nm">{l.name}</span>
            <div className="split-units">
              {(units.get(l.key) ?? []).map((u) => {
                const held = owner[u.id];
                return (
                  <button key={u.id} className={'split-unit' + (held === undefined ? '' : held === active ? ' mine' : ' theirs')}
                    disabled={busy} onClick={() => claim(u.id)}
                    aria-label={`${l.name} · ${held === undefined ? t('splitTake') + ' ' + (active + 1) : `${t('splitPerson')} ${held + 1}`}`}>
                    {held === undefined ? '·' : <Ltr>{held + 1}</Ltr>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="split-label split-items-lb">{t('splitPick')}</div>
      <div className="split-rows">
        {owed.map((baisa, p) => (
          <div className={'split-row' + (methods[p] && baisa > 0 ? ' done' : '')} key={p}>
            <button className={'split-no' + (p === active ? ' on' : '')} disabled={busy}
              aria-label={`${t('splitPerson')} ${p + 1}`} onClick={() => setActive(p)}>
              <Ltr>{p + 1}</Ltr>
            </button>
            <span className="split-amt owed num"><Money value={baisa / 1000} /></span>
            <button className={'split-pay cash' + (methods[p] === 'CASH' ? ' on' : '')} disabled={busy || baisa === 0}
              aria-pressed={methods[p] === 'CASH'} aria-label={`${t('splitPerson')} ${p + 1} · ${t('paymentCash')}`}
              onClick={() => pay(p, 'CASH')}><span aria-hidden="true">💵</span></button>
            <button className={'split-pay card' + (methods[p] === 'CARD' ? ' on' : '')} disabled={busy || baisa === 0}
              aria-pressed={methods[p] === 'CARD'} aria-label={`${t('splitPerson')} ${p + 1} · ${t('paymentCard')}`}
              onClick={() => pay(p, 'CARD')}><span aria-hidden="true">▣</span></button>
          </div>
        ))}
      </div>

      {/* What stops the counter closing a bill that is only three-quarters collected. */}
      <div className={'split-left' + (left.length ? '' : ' ok')} aria-live="polite">
        <span>{left.length ? t('splitLeft') : t('splitReady')}</span>
        {left.length ? <span className="num"><Ltr>{left.length}</Ltr></span> : <span aria-hidden="true">✓</span>}
      </div>

      <button className="btn split-settle" disabled={busy || !ready} onClick={() => onSettle(tenders)}>
        {t('splitSettle')}
      </button>
      <button className="btn ghost payment-cancel" disabled={busy} onClick={onBack}>{t('back')}</button>
    </>
  );
}
