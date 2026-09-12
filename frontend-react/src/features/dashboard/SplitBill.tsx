import { useMemo, useState } from 'react';
import { Money } from '../../lib/Money';
import { Ltr, useT, type Dict } from '../../lib/i18n';
import type { PaymentTender } from '../../lib/types';

/**
 * Dividing one bill between the people at the table, by what each of them ordered.
 *
 * Lives on its own because two screens settle a bill: the live board, where an order already
 * exists and a Collect tap pays it, and the order pad, where the order is still being built
 * and the shares travel with it. Both hand it the same normalised lines.
 *
 * It splits by ITEM, not by amount. Typing four numbers that happen to add up to the bill was
 * the counter doing arithmetic the tablet should be doing, and it answered the wrong question:
 * a table does not want the bill in four equal pieces, it wants each person to pay for their
 * own coffee. So the only thing to do here is say who had what.
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

const MAX_PEOPLE = 12;

/** One orderable unit: a line of quantity three becomes three of these, each assignable. */
interface Unit { id: string; weight: number }

const DICT: Dict = {
  ar: {
    splitWho: 'الإضافة إلى', splitPerson: 'شخص', splitMore: 'إضافة شخص', splitFewer: 'إزالة شخص',
    splitItems: 'من طلب ماذا؟', splitTake: 'لـ',
    splitLeft: 'لم تُوزّع', splitReady: 'وُزّعت كل الأصناف', splitPick: 'اختر طريقة الدفع لكل شخص',
    splitSettle: 'تسجيل الدفع',
    paymentCash: 'نقداً', paymentCard: 'بطاقة / فيزا', back: 'رجوع',
  },
  en: {
    splitWho: 'Adding to', splitPerson: 'Person', splitMore: 'Add a person', splitFewer: 'Remove a person',
    splitItems: 'Who had what?', splitTake: 'to',
    splitLeft: 'Not assigned', splitReady: 'Every item assigned', splitPick: 'Choose how each person pays',
    splitSettle: 'Record payment',
    paymentCash: 'Cash', paymentCard: 'Card / Visa', back: 'Back',
  },
};

/**
 * Give each person their share of the bill in whole baisa, in proportion to what they had,
 * summing to the bill exactly.
 *
 * The weights are item money; the total is what the customer actually owes — VAT, a discount
 * and a redeemed reward included. Scaling one onto the other, rather than adding tax per
 * person, is what keeps the shares adding to a figure the server will accept whatever the café
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

export function SplitBill({ total, lines, busy, onSettle, onBack }: {
  total: number; lines: SplitLine[]; busy: boolean;
  onSettle: (tenders: PaymentTender[]) => void; onBack: () => void;
}) {
  const t = useT(DICT);
  const totalBaisa = Math.round(total * 1000);

  const units = useMemo(() => new Map(lines.map((l) => {
    const n = Math.max(1, l.qty);
    return [l.key, Array.from({ length: n }, (_, i): Unit => ({ id: `${l.key}#${i}`, weight: l.lineTotal / n }))];
  })), [lines]);
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
  // The unclaimed pile rides along as one more weight, so a share always reads as its true
  // slice of the real bill while assignment is still going on rather than swelling to fill it.
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
    <div className="split">
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
    </div>
  );
}
