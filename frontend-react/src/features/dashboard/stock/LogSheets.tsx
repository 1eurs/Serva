import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { useI18n, pick } from '../../../lib/i18n';
import { useToast } from '../../../lib/toast';
import type { StockItemRow, WasteReason } from '../../../lib/types';
import { Sheet } from './parts';
import { packLabel, qty, unitTag } from './units';

type T = (k: string) => string;

const WASTE_REASONS: WasteReason[] = [
  'SPILLED', 'EXPIRED', 'STAFF_MEAL', 'COMP', 'TRAINING', 'DAMAGED', 'OTHER',
];

/* ================================================================== delivery */

/**
 * An invoice, entered the way it arrives: several lines at once, in the pack the café buys.
 *
 * <p>It is the commonest input in the feature and belongs to no single item — eight things
 * turn up together on one van — which is why it is reachable from the item panel and from
 * nowhere deeper than that.
 */
export function DeliverySheet({ t, branchId, items, queryKey, initialItemId, onClose }: {
  t: T; branchId?: number; items: StockItemRow[];
  queryKey: unknown[]; initialItemId?: number; onClose: () => void;
}) {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  /* Deliveries don't always match the pack you configured — the item might say "1 kg" but
     today a 500 g bag turned up. Each line can be entered either in packs or directly in the
     counting unit, so nobody has to work out that 500 g is "0.5 packs". */
  type Mode = 'pack' | 'base';
  /* Opened from the shelf there is no item yet, and the line starts empty rather than on
     whatever sorts first. Defaulting to items[0] meant a sheet reached without choosing
     anything arrived pre-filled with an unrelated item — the one mistake here that is silent,
     lands in the ledger, and is only found at the next count. */
  const [lines, setLines] = useState<
  { stockItemId: number; packs: string; unitCost: string; mode: Mode }[]>([
    { stockItemId: initialItemId ?? 0, packs: '', unitCost: '', mode: 'pack' },
  ]);
  const sizeOf = (item?: StockItemRow) => (item && item.purchaseUnitSize > 0 ? item.purchaseUnitSize : 1);
  const patch = (idx: number, p: Partial<(typeof lines)[number]>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...p } : l)));

  const save = useMutation({
    mutationFn: () => {
      const payload = lines
        .filter((l) => l.stockItemId && Number(l.packs) > 0)
        .map((l) => {
          const item = items.find((i) => i.id === l.stockItemId)!;
          // in base mode the number already IS the counting unit, so nothing to multiply
          const factor = l.mode === 'pack' ? sizeOf(item) : 1;
          return {
            stockItemId: l.stockItemId,
            quantityBase: Number(l.packs) * factor,
            // The café types what a pack cost; the ledger stores cost per base unit.
            unitCost: l.unitCost ? Number(l.unitCost) / factor : null,
          };
        });
      return api.post('/api/dashboard/stock/receive', { branchId, lines: payload });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey }); toast(t('saved')); onClose(); },
    onError: (e: Error) => toast(e.message),
  });

  /* Nothing to record until one line is complete. The button used to be live over an empty
     sheet and posted an empty delivery. */
  const problem = lines.some((l) => l.stockItemId && Number(l.packs) > 0) ? null : t('needLine');

  return (
    <Sheet title={t('logDelivery')} onClose={onClose} onSubmit={() => save.mutate()}
      submitLabel={t('record')} busy={save.isPending} problem={problem}>
      {lines.map((line, idx) => {
        const item = items.find((i) => i.id === line.stockItemId);
        const landed = Number(line.packs) * (line.mode === 'pack' ? sizeOf(item) : 1);
        return (
          <div className="stk-line card" key={idx}>
            {lines.length > 1 && (
              <button className="x" aria-label="remove"
                onClick={() => setLines((p) => p.filter((_, i) => i !== idx))}>✕</button>
            )}
            <select value={line.stockItemId} aria-label={t('items')}
              onChange={(e) => patch(idx, { stockItemId: Number(e.target.value) })}>
              <option value={0} disabled>{t('chooseItem')}</option>
              {items.map((i) => <option key={i.id} value={i.id}>{pick(i, 'name', lang)}</option>)}
            </select>
            {/* How much comes after what. Before an item is named these fields labelled
                themselves off a fallback base unit — a quantity prompt for nothing. */}
            {!!item && (
              <div className="pair">
                <label>
                  <span>
                    {line.mode === 'pack'
                      ? packLabel(item.baseUnit, item.purchaseUnitSize, t)
                      : t(item.baseUnit)}
                    <button type="button" className="stk-unit-swap"
                      onClick={() => patch(idx, {
                        mode: line.mode === 'pack' ? 'base' : 'pack', packs: '', unitCost: '',
                      })}>
                      {line.mode === 'pack'
                        ? t('enterInUnit').replace('{u}', t(item.baseUnit))
                        : t('enterInPacks')}
                    </button>
                  </span>
                  <input type="number" inputMode="decimal" min="0" step="0.01" value={line.packs}
                    onChange={(e) => patch(idx, { packs: e.target.value })} />
                </label>
                <label>
                  <span>{line.mode === 'pack'
                    ? `${t('costPer')} ${packLabel(item.baseUnit, item.purchaseUnitSize, t)}`
                    : `${t('costPer')} ${t(item.baseUnit)}`}</span>
                  <input type="number" inputMode="decimal" min="0" step="0.001" value={line.unitCost}
                    onChange={(e) => patch(idx, { unitCost: e.target.value })} />
                </label>
              </div>
            )}
            {/* Always show what lands on the shelf, so a wrong pack size is caught here rather
                than discovered at the next count. */}
            {landed > 0 && (
              <p className="stk-spec-sum">
                <span>
                  <b className="num">
                    {qty(landed, item?.baseUnit)}{' '}
                    {item?.baseUnit === 'PIECE' ? t('PIECE') : unitTag(item?.baseUnit, t)}
                  </b> {t('lands')}
                </span>
              </p>
            )}
          </div>
        );
      })}
      <button className="stk-mini"
        onClick={() => setLines((p) => [...p, { stockItemId: 0, packs: '', unitCost: '', mode: 'pack' }])}>
        + {t('addLine')}
      </button>
    </Sheet>
  );
}

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
