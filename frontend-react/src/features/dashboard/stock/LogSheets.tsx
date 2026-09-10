import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { useI18n, pick } from '../../../lib/i18n';
import { useToast } from '../../../lib/toast';
import type { StockItemRow, WasteReason } from '../../../lib/types';
import { Sheet } from './parts';
import { qty, unitTag } from './units';

/* Taking a delivery used to live here too, as a table of lines with an item dropdown on each.
   It is gone: a delivery is now tapped in on the wall, one tile at a time, in AddSheet. The
   dropdown was the expensive part — picking the right row out of forty names is the one
   mistake on this feature that is silent, lands in the ledger and is only found at the next
   count. Tapping the thing you are holding cannot pick the wrong item. */

type T = (k: string) => string;

const WASTE_REASONS: WasteReason[] = [
  'SPILLED', 'EXPIRED', 'STAFF_MEAL', 'COMP', 'TRAINING', 'DAMAGED', 'OTHER',
];

/* ================================================================== waste */

/**
 * Waste with a reason, not a free-text note. Staff meals and comps are a large hidden cost
 * bucket and the report is only actionable if they are separable from spoilage.
 */
export function WasteSheet({ t, branchId, items, queryKey, initialItemId, onClose }: {
  t: T; branchId?: number; items: StockItemRow[];
  queryKey: unknown[]; initialItemId?: number; onClose: () => void;
}) {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [stockItemId, setStockItemId] = useState(initialItemId ?? items[0]?.id ?? 0);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState<WasteReason>('SPILLED');
  const [note, setNote] = useState('');

  const item = items.find((i) => i.id === stockItemId);
  const save = useMutation({
    mutationFn: () => api.post('/api/dashboard/stock/waste', {
      branchId, stockItemId, quantityBase: Number(amount), reason, note: note || null,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey }); toast(t('saved')); onClose(); },
    onError: (e: Error) => toast(e.message),
  });

  return (
    <Sheet title={t('logWaste')} onClose={onClose} onSubmit={() => save.mutate()}
      submitLabel={t('record')} busy={save.isPending}
      problem={Number(amount) > 0 && stockItemId ? null : t('needLine')}>
      <label className="stk-f">
        <span>{t('items')}</span>
        <select value={stockItemId} onChange={(e) => setStockItemId(Number(e.target.value))}>
          {items.map((i) => <option key={i.id} value={i.id}>{pick(i, 'name', lang)}</option>)}
        </select>
      </label>
      <label className="stk-f">
        <span>{t('quantity')} ({item ? t(item.baseUnit) : ''})</span>
        <input type="number" inputMode="decimal" min="0" step="0.1" value={amount}
          onChange={(e) => setAmount(e.target.value)} autoFocus />
      </label>
      <div className="stk-f">
        <span>{t('reason')}</span>
        <div className="stk-chips" role="group" aria-label={t('reason')}>
          {WASTE_REASONS.map((r) => (
            <button key={r} type="button" aria-pressed={reason === r}
              className={reason === r ? 'on' : ''} onClick={() => setReason(r)}>{t(r)}</button>
          ))}
        </div>
      </div>
      <label className="stk-f">
        <span>{t('note')}</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
    </Sheet>
  );
}

/* ================================================================== recount */

/**
 * "The shelf says 820 g." Sets on-hand outright; the ledger records the difference.
 *
 * <p>Deliberately not flagged as a count: a walk of the whole shelf is what earns the page
 * the right to say "counted an hour ago", and one item typed over — usually because a
 * delivery went unlogged — must not reset that clock over thirty rows nobody looked at.
 */
export function RecountSheet({ t, branchId, queryKey, item, onClose }: {
  t: T; branchId?: number; queryKey: unknown[]; item: StockItemRow; onClose: () => void;
}) {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [value, setValue] = useState(String(item.onHand));
  const [note, setNote] = useState('');

  const save = useMutation({
    mutationFn: () => api.post('/api/dashboard/stock/adjust', {
      branchId, stockItemId: item.id, quantityBase: Number(value), note: note || null,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey }); toast(t('saved')); onClose(); },
    onError: (e: Error) => toast(e.message),
  });

  const diff = Number(value) - item.onHand;
  return (
    <Sheet title={`${t('recount')} · ${pick(item, 'name', lang)}`} onClose={onClose}
      onSubmit={() => save.mutate()} submitLabel={t('save')} busy={save.isPending}>
      <label className="stk-f big">
        <span>{t('onHand')} ({t(item.baseUnit)})</span>
        <input className="num" type="number" inputMode="decimal" step="0.1" value={value}
          onChange={(e) => setValue(e.target.value)} autoFocus />
      </label>
      {/* Says why this exists at all: sales already draw stock down, so anyone opening this is
          here because the shelf and the system disagree. */}
      <p className="stk-hint">{t('recountHint')}</p>
      {Math.abs(diff) > 0.001 && (
        <p className="stk-spec-sum">
          <span>{t('quantity')}{' '}
            <b className="num">
              {diff > 0 ? '+' : ''}{qty(diff, item.baseUnit)} {unitTag(item.baseUnit, t)}
            </b>
          </span>
        </p>
      )}
      <label className="stk-f"><span>{t('note')}</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} /></label>
    </Sheet>
  );
}
