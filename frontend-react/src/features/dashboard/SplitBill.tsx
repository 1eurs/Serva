import { useMemo, useState } from 'react';
import { Money } from '../../lib/Money';
import { useT, type Dict } from '../../lib/i18n';
import type { PaymentTender } from '../../lib/types';

/**
 * Dividing one bill between cash and card.
 *
 * Lives on its own because two screens settle a bill: the live board, where an order already
 * exists and a Collect tap pays it, and the order pad, where the order is still being built
 * and the shares travel with it. Both hand it the same normalised lines and take back the
 * same tenders, so what lands in the ledger is one payment row per method — the only shape
 * the till and the cash-vs-card report can count.
 *
 * It is a grid: every thing on the table is a row, and the row says how it was paid. Nothing
 * else. The first version asked how many people were at the table and who had what; the
 * second made you pick a wallet and then tap items into it. Cafés wanted neither — they wanted
 * to look down the bill and say "that one was card". So every row starts on cash, the counter
 * flips the ones that were not, and the two totals at the bottom are what gets recorded.
 * There is no "not assigned" state to get stuck in, because a row is always one or the other.
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

/** One orderable unit: a line of quantity three becomes three rows, each paid its own way. */
interface Unit { id: string; name: string; price: number; weight: number }

const DICT: Dict = {
  ar: {
    everything: 'الكل', cash: 'نقداً', card: 'بطاقة',
    settle: 'تسجيل الدفع', back: 'رجوع',
  },
  en: {
    everything: 'Everything', cash: 'Cash', card: 'Card',
    settle: 'Record payment', back: 'Back',
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

/** Cash | Card, as one control. `value` null means the rows it stands for disagree. */
function Pill({ value, onPick, name, disabled, large }: {
  value: Tender | null; onPick: (m: Tender) => void; name: string; disabled: boolean; large?: boolean;
}) {
  const t = useT(DICT);
  return (
    <div className={'split-pill' + (large ? ' lg' : '')} role="radiogroup" aria-label={name}>
      <button type="button" role="radio" aria-checked={value === 'CASH'} disabled={disabled}
        className={'cash' + (value === 'CASH' ? ' on' : '')} onClick={() => onPick('CASH')}>{t('cash')}</button>
      <button type="button" role="radio" aria-checked={value === 'CARD'} disabled={disabled}
        className={'card' + (value === 'CARD' ? ' on' : '')} onClick={() => onPick('CARD')}>{t('card')}</button>
    </div>
  );
}

export function SplitBill({ total, lines, busy, onSettle, onBack }: {
  total: number; lines: SplitLine[]; busy: boolean;
  onSettle: (tenders: PaymentTender[]) => void; onBack: () => void;
}) {
  const t = useT(DICT);
  const totalBaisa = Math.round(total * 1000);

  const units = useMemo<Unit[]>(() => lines.flatMap((l) => {
    const n = Math.max(1, l.qty);
    return Array.from({ length: n }, (_, i) => ({ id: `${l.key}#${i}`, name: l.name, price: l.lineTotal / n, weight: l.lineTotal / n }));
  }), [lines]);

  /** The rows that were card. Everything else is cash — the state is exactly the exceptions. */
  const [card, setCard] = useState<Set<string>>(() => new Set());
  const pick = (id: string, m: Tender) => setCard((prev) => {
    const next = new Set(prev);
    if (m === 'CARD') next.add(id); else next.delete(id);
    return next;
  });
  const pickAll = (m: Tender) => setCard(m === 'CARD' ? new Set(units.map((u) => u.id)) : new Set());
  const all: Tender | null = card.size === 0 ? 'CASH' : card.size === units.length ? 'CARD' : null;

  const [cashBaisa, cardBaisa] = shareOut(totalBaisa, [
    units.reduce((s, u) => s + (card.has(u.id) ? 0 : u.weight), 0),
    units.reduce((s, u) => s + (card.has(u.id) ? u.weight : 0), 0),
  ]);
  const tenders: PaymentTender[] = [
    ...(cashBaisa > 0 ? [{ method: 'CASH' as const, amount: cashBaisa / 1000 }] : []),
    ...(cardBaisa > 0 ? [{ method: 'CARD' as const, amount: cardBaisa / 1000 }] : []),
  ];

  return (
    <div className="split">
      <div className="split-all">
        <span className="split-all-lb">{t('everything')}</span>
        <Pill large value={all} onPick={pickAll} name={t('everything')} disabled={busy} />
      </div>

      <div className="split-grid">
        {units.map((u) => (
          <div className="split-line" key={u.id}>
            <span className="split-line-nm">{u.name}</span>
            <span className="split-line-pr num"><Money value={u.price} /></span>
            <Pill value={card.has(u.id) ? 'CARD' : 'CASH'} onPick={(m) => pick(u.id, m)} name={u.name} disabled={busy} />
          </div>
        ))}
      </div>

      {/* The two tenders, live — readable back to the customer before anything is written,
          and already VAT-apportioned, so they are what the ledger will hold to the baisa. */}
      <div className="split-sum" aria-live="polite">
        <div className={'split-sum-cell cash' + (cashBaisa ? '' : ' none')}>
          <span className="split-sum-k">{t('cash')}</span>
          <span className="split-sum-v num"><Money value={cashBaisa / 1000} /></span>
        </div>
        <div className={'split-sum-cell card' + (cardBaisa ? '' : ' none')}>
          <span className="split-sum-k">{t('card')}</span>
          <span className="split-sum-v num"><Money value={cardBaisa / 1000} /></span>
        </div>
      </div>

      <button className="btn split-settle" disabled={busy || tenders.length === 0} onClick={() => onSettle(tenders)}>
        {t('settle')}
      </button>
      <button className="btn ghost payment-cancel" disabled={busy} onClick={onBack}>{t('back')}</button>
    </div>
  );
}
