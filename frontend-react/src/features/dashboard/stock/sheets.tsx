import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { useConfirm } from '../../../lib/confirm';
import { useI18n, pick } from '../../../lib/i18n';
import { Money } from '../../../lib/Money';
import { useToast } from '../../../lib/toast';
import type { StockItemPayload, StockItemRow, StockUnit, StockUsageRow } from '../../../lib/types';
import { fill } from './copy';
import { PACK_UNITS, UNITS, agoWords, daysWord, parts, qty, unitWord, type Preset } from './units';

type T = (k: string) => string;

/**
 * The one modal on the feature. Everything that is not the wall opens in one of these, so a
 * person learns one way in and one way out.
 */
export function Sheet({ title, onClose, children, onSubmit, submitLabel, busy, problem }: {
  title: string; onClose: () => void; children: ReactNode;
  onSubmit?: () => void; submitLabel?: string; busy?: boolean;
  /** Why the sheet cannot be submitted yet, said beside the button that is off. */
  problem?: string | null;
}) {
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
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card stk-sheet stock-page" role="dialog" aria-modal="true" aria-label={title}>
        <div className="stk-sheet-hd">
          <h3>{title}</h3>
          <button className="stk-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="stk-sheet-body">{children}</div>
        {onSubmit && (
          <div className="stk-sheet-ft">
            {problem && <p className="stk-why" role="status">{problem}</p>}
            <button className="btn" onClick={onSubmit} disabled={busy || !!problem}>{submitLabel}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Deliveries a café takes in at once, in the unit the item is counted in. */
const STEPS: Record<StockUnit, number[]> = {
  KG: [1, 2, 5, 10],
  G: [100, 250, 500, 1000],
  L: [1, 2, 5, 10],
  ML: [250, 500, 750, 1000],
  PIECE: [10, 25, 50, 100],
};

/**
 * Tap a tile: say what arrived.
 *
 * <p>This is the whole reason the wall is tappable and it is deliberately the shallowest
 * screen here. Something turned up, say how much, done — while somebody is still holding the
 * box. The quantity is never typed as a total: adding is adding, and the sheet says what the
 * shelf will read afterwards so a fat finger is caught before it is saved rather than at the
 * next count.
 *
 * <p>Correcting the count lives behind the second tab of the same sheet, because it is the
 * other true thing that can happen to a number and hiding it would leave a typo permanent.
 * The two are never one control: a delivery of 6 and a shelf holding 6 are different facts.
 */
export function ItemSheet({ t, item, usage, queryKey, onClose, onEdit }: {
  t: T; item: StockItemRow; usage?: StockUsageRow; queryKey: unknown[]; onClose: () => void; onEdit: () => void;
}) {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [mode, setMode] = useState<'add' | 'count'>('add');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const [showPrice, setShowPrice] = useState(false);

  const unitName = unitWord(item.unit, lang);
  const n = Number(amount) || 0;
  const on = parts(item.quantity, item.unit, lang);
  const when = agoWords(item.lastMovedAt, lang);

  const done = (message: string) => {
    qc.invalidateQueries({ queryKey });
    toast(message);
    onClose();
  };

  const receive = useMutation({
    mutationFn: () => api.post(`/api/stock/${item.id}/receive`, {
      amount: n, unitPrice: Number(price) > 0 ? Number(price) : null,
    }),
    onSuccess: () => done(fill(t('addedToast'), { q: `${qty(n, item.unit)} ${unitName}` })),
    onError: (e: Error) => toast(e.message),
  });

  const count = useMutation({
    mutationFn: () => api.post(`/api/stock/${item.id}/count`, { quantity: Number(amount) || 0 }),
    onSuccess: () => done(t('countedToast')),
    onError: (e: Error) => toast(e.message),
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/api/stock/${item.id}`),
    onSuccess: () => done(t('removedToast')),
    onError: (e: Error) => toast(e.message),
  });

  const askRemove = async () => {
    const ok = await confirm({
      title: fill(t('removeWarn'), { name: pick(item, 'name', lang) }),
      confirmLabel: t('removeItem'), danger: true,
    });
    if (ok) remove.mutate();
  };

  const adding = mode === 'add';
  const busy = receive.isPending || count.isPending || remove.isPending;

  return (
    <Sheet
      title={pick(item, 'name', lang)}
      onClose={onClose}
      onSubmit={() => (adding ? receive.mutate() : count.mutate())}
      submitLabel={adding ? t('addStock') : t('countSave')}
      busy={busy}
      problem={adding
        ? (n <= 0 ? t('needAmount') : null)
        /* A blank count is not a count of nothing. Typing 0 is a real answer — it ran out —
           but tapping save on an empty field must not zero the shelf. */
        : (amount.trim() === '' ? t('needCount') : null)}
    >
      {/* What is there now, stated before anything is asked: somebody adding to a shelf is
          usually also checking it, and this is the figure they came to see. */}
      <div className="stk-now">
        <span>{t('onShelf')}</span>
        <b><i className="num">{on.n}</i> <em>{on.u}</em>
          {item.packUnit && item.packSize != null && (
            <em className="stk-each">{fill(t('each'), { q: `${qty(item.packSize, item.packUnit)} ${unitWord(item.packUnit, lang)}` })}</em>
          )}
        </b>
        <small>{when ? fill(t('updatedAgo'), { when }) : t('notCounted')}</small>
        {/* Where it is going, worked out from sales rather than counts — which is why it can
            speak for a tin nobody has recounted this week. Silent until something has sold. */}
        {/* The explanation for the figure above: what sales have drawn since a person last
            said what was there. If the two disagree with the fridge, that is what a recount is for. */}
        {usage?.usedSinceCount != null && usage.usedSinceCount > 0 && (
          <small className="stk-pace">
            {fill(t('usedSince'), { q: `${qty(usage.usedSinceCount, item.unit)} ${unitName}` })}
          </small>
        )}
        {usage && usage.perDay > 0 && (
          <small className="stk-pace">
            {fill(t('usesPerDay'), { q: `${qty(usage.perDay, item.unit)} ${unitName}` })}
            {' · '}
            {usage.daysLeft != null && usage.daysLeft < 1
              ? t('lessThanDay')
              : fill(t('daysLeft'), { n: Math.floor(usage.daysLeft ?? 0), d: daysWord(Math.floor(usage.daysLeft ?? 0), lang) })}
          </small>
        )}
      </div>

      <div className="stk-tabs" role="tablist">
        <button role="tab" aria-selected={adding} className={adding ? 'on' : ''}
          onClick={() => { setMode('add'); setAmount(''); }}>{t('arrived')}</button>
        <button role="tab" aria-selected={!adding} className={!adding ? 'on' : ''}
          onClick={() => { setMode('count'); setAmount(''); }}>{t('recount')}</button>
      </div>

      {adding ? (
        <>
          <div className="stk-keys" role="group" aria-label={t('arrived')}>
            {(item.unit === 'PIECE' && item.packUnit ? [1, 6, 12, 24] : STEPS[item.unit]).map((s) => (
              <button key={s} type="button" aria-pressed={n === s}
                className={`stk-key${n === s ? ' on' : ''}`}
                onClick={() => setAmount(n === s ? '' : String(s))}>
                <i className="num">{s}</i> {unitName}
              </button>
            ))}
          </div>

          {/* A delivery is not always one of four round numbers, and the way out has to be on
              the same screen rather than behind a mode switch. */}
          <label className="stk-f">
            <span>{t('otherAmount')}</span>
            <span className="stk-in">
              <input className="num" type="number" inputMode="decimal" min="0" step="0.01" dir="ltr"
                value={amount} onChange={(e) => setAmount(e.target.value)} />
              <em>{unitName}</em>
            </span>
          </label>

          {showPrice ? (
            <label className="stk-f">
              <span>{fill(t('pricePer'), { u: unitName })}</span>
              <span className="stk-in">
                <input className="num" type="number" inputMode="decimal" min="0" step="0.001" dir="ltr"
                  autoFocus value={price} onChange={(e) => setPrice(e.target.value)} />
              </span>
            </label>
          ) : (
            /* Price matters — it is what the shelf's value is made of — but an owner without
               the invoice to hand must not be stopped from recording the stock. */
            <button type="button" className="stk-link" onClick={() => setShowPrice(true)}>
              {t('addPrice')}
              {item.unitPrice ? <> · <Money value={Number(item.unitPrice)} /></> : null}
            </button>
          )}

          {n > 0 && (
            <p className="stk-lands">
              {fill(t('lands'), { q: `${qty(Number(item.quantity) + n, item.unit)} ${unitName}` })}
            </p>
          )}
        </>
      ) : (
        <>
          <label className="stk-f">
            <span>{t('countT')}</span>
            <span className="stk-in">
              <input className="num" type="number" inputMode="decimal" min="0" step="0.01" dir="ltr"
                autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
              <em>{unitName}</em>
            </span>
          </label>
          <p className="stk-hint">{t('countHint')}</p>
        </>
      )}

      <div className="stk-else">
        <button type="button" onClick={onEdit}>{t('editItem')}</button>
        <button type="button" className="danger" onClick={askRemove}>{t('removeItem')}</button>
      </div>
    </Sheet>
  );
}

/**
 * Adding what you buy, and editing it later.
 *
 * <p>Five fields, two of them optional, and the number is only asked for once — when the item
 * is new. Editing cannot touch it: a form that renames a thing and restates its stock in the
 * same save makes the figure impossible to trust, so the quantity moves through the sheet
 * above, where each way of moving it is named for what happened.
 */
export function ItemForm({ t, branchId, queryKey, item, seedName, seedPreset, onClose }: {
  t: T; branchId?: number; queryKey: unknown[];
  item: StockItemRow | null;
  /** What was typed into the search when it came back with nothing. */
  seedName?: string;
  /** A tap on a starter item: it knows the name in both languages and the unit. */
  seedPreset?: Preset | null;
  onClose: () => void;
}) {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const editing = !!item;

  const [name, setName] = useState(
    item ? pick(item, 'name', lang) : seedPreset ? seedPreset[lang] : seedName ?? '');
  const [unit, setUnit] = useState<StockUnit>(item?.unit ?? seedPreset?.unit ?? 'PIECE');
  const [have, setHave] = useState('');
  const [line, setLine] = useState(item?.reorderPoint != null ? String(item.reorderPoint) : '');
  const [price, setPrice] = useState(item?.unitPrice != null ? String(item.unitPrice) : '');
  /* What one piece holds. Only asked when counting in pieces; cleared if the unit moves away. */
  const [packSize, setPackSize] = useState(
    item?.packSize != null ? String(item.packSize) : seedPreset?.packSize != null ? String(seedPreset.packSize) : '');
  const [packUnit, setPackUnit] = useState<StockUnit>(item?.packUnit ?? seedPreset?.packUnit ?? 'L');

  const unitName = unitWord(unit, lang);
  const trimmed = name.trim();

  /**
   * The form asks for one name; the item has a column per script. Which is which is worked
   * out here rather than left to the server's guess, because a guess cannot see the case
   * that matters: an item carrying BOTH names, opened by an Arabic reader who changes
   * nothing. Filed by script alone, that save would have written the Arabic name it was
   * shown and wiped the English one — a rename nobody performed.
   *
   * So: a name left alone keeps the pair it already had, a starter item keeps the pair it
   * came with, and a name actually typed becomes the one name it is, in its own script,
   * clearing the other side. (An empty string clears; see Names.applyOnUpdate.)
   */
  const arabic = /[\u0600-\u06FF]/.test(trimmed);
  const untouched = !!seedPreset && trimmed === seedPreset[lang];
  const unchanged = !!item && trimmed === pick(item, 'name', lang);
  const names = unchanged ? { nameEn: item!.nameEn ?? '', nameAr: item!.nameAr ?? '' }
    : untouched ? { nameEn: seedPreset!.en, nameAr: seedPreset!.ar }
      : arabic ? { nameEn: '', nameAr: trimmed }
        : { nameEn: trimmed, nameAr: '' };

  const save = useMutation({
    mutationFn: () => {
      const pack = unit === 'PIECE' && Number(packSize) > 0;
      const body: StockItemPayload = {
        ...names,
        unit,
        reorderPoint: Number(line) > 0 ? Number(line) : null,
        unitPrice: Number(price) > 0 ? Number(price) : null,
        packSize: pack ? Number(packSize) : null,
        packUnit: pack ? packUnit : null,
      };
      return editing
        ? api.patch(`/api/stock/${item!.id}`, body)
        : api.post(`/api/branches/${branchId}/stock`, { ...body, quantity: Number(have) || 0 });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast(t('savedToast'));
      onClose();
    },
    onError: (e: Error) => toast(e.message),
  });

  return (
    <Sheet
      title={editing ? t('editT') : t('newT')}
      onClose={onClose}
      onSubmit={() => save.mutate()}
      submitLabel={t('save')}
      busy={save.isPending}
      problem={trimmed ? null : t('needName')}
    >
      <label className="stk-f">
        <span>{t('fName')}</span>
        <span className="stk-in">
          <input value={name} autoFocus={!name} onChange={(e) => setName(e.target.value)} />
        </span>
      </label>

      <div className="stk-f">
        <span>{t('fUnit')}</span>
        <div className="stk-units" role="group" aria-label={t('fUnit')}>
          {UNITS.map((u) => (
            <button key={u} type="button" aria-pressed={unit === u}
              className={`stk-unit${unit === u ? ' on' : ''}`} onClick={() => setUnit(u)}>
              {t(`u${u}`)}
            </button>
          ))}
        </div>
      </div>

      {/* A bottle is a piece that holds a litre. Said once here, so a recipe can pour
          millilitres from it while the wall goes on counting bottles. */}
      {unit === 'PIECE' && (
        <label className="stk-f">
          <span>{t('fPack')}</span>
          <span className="stk-in">
            <input className="num" type="number" inputMode="decimal" min="0" step="0.01" dir="ltr"
              value={packSize} onChange={(e) => setPackSize(e.target.value)} />
            <select className="stk-select stk-unit-pick" value={packUnit} aria-label={t('fUnit')}
              onChange={(e) => setPackUnit(e.target.value as StockUnit)}>
              {PACK_UNITS.map((u) => <option key={u} value={u}>{unitWord(u, lang)}</option>)}
            </select>
          </span>
          <em className="stk-hint">{t('fPackHint')}</em>
        </label>
      )}

      {/* Changing the unit does not convert the figure — nothing in this model converts — so
          an owner who has been reading "6" all week is told it will still say 6. */}
      {editing && unit !== item!.unit && Number(item!.quantity) > 0 && (
        <p className="stk-hint">{fill(t('unitWarn'), { n: qty(item!.quantity, unit) })}</p>
      )}

      {!editing && (
        <label className="stk-f">
          <span>{t('fHave')}</span>
          <span className="stk-in">
            <input className="num" type="number" inputMode="decimal" min="0" step="0.01" dir="ltr"
              value={have} onChange={(e) => setHave(e.target.value)} />
            <em>{unitName}</em>
          </span>
        </label>
      )}

      <label className="stk-f">
        <span>{t('fLine')}</span>
        <span className="stk-in">
          <input className="num" type="number" inputMode="decimal" min="0" step="0.01" dir="ltr"
            value={line} onChange={(e) => setLine(e.target.value)} />
          <em>{unitName}</em>
        </span>
      </label>
      <p className="stk-hint">{t('fLineHint')}</p>

      <label className="stk-f">
        <span>{fill(t('pricePer'), { u: unitName })}</span>
        <span className="stk-in">
          <input className="num" type="number" inputMode="decimal" min="0" step="0.001" dir="ltr"
            value={price} onChange={(e) => setPrice(e.target.value)} />
        </span>
      </label>
    </Sheet>
  );
}
