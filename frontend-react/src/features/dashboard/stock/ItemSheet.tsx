import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { useI18n, pick } from '../../../lib/i18n';
import { Money } from '../../../lib/Money';
import type { CoverRow, MenuLinkRow, MovementRow, StockItemRow } from '../../../lib/types';
import { Gauge, MoveLine, Sheet, stateLabel } from './parts';
import { dayWord, fill, levelOf, qty, unitTag } from './units';
import type { SheetReq } from './StockPage';

type T = (k: string) => string;

/**
 * One item: everything about it, every verb that applies to it, and where its number came
 * from. Tapping a row used to open an edit form and tapping its figure opened a correction —
 * there was nowhere that simply told you about a thing.
 *
 * <p>The line that is new is "used by": an ingredient nothing on the menu draws on will sit
 * at whatever figure it was last given for ever, and the owner watching it not move had no
 * way of learning why. Said here, on the item it is true of, with the fix attached.
 */
export default function ItemSheet({ t, branchId, item, cover, links, openSheet, onClose }: {
  t: T; branchId?: number; item: StockItemRow; cover?: CoverRow; links: MenuLinkRow[];
  openSheet: (s: SheetReq) => void; onClose: () => void;
}) {
  const { lang } = useI18n();
  const state = levelOf(item);
  const label = stateLabel(item, cover, t, lang);

  const movesQ = useQuery({
    queryKey: ['stock', branchId ?? 'me', 'movements', item.id],
    queryFn: () => {
      const p = new URLSearchParams({ stockItemId: String(item.id) });
      if (branchId) p.set('branchId', String(branchId));
      return api.get<MovementRow[]>(`/api/dashboard/stock/movements?${p}`);
    },
  });
  const moves = (movesQ.data ?? []).slice(0, 6);

  const usedBy = links.filter((l) => l.takes.some((k) => k.stockItemId === item.id)).length;
  const packCost = Number(item.costPerBaseUnit) * (Number(item.purchaseUnitSize) || 1);
  const go = (s: SheetReq) => { onClose(); openSheet(s); };

  return (
    <Sheet title={pick(item, 'name', lang)} onClose={onClose}>
      <div className="stk-panel" data-state={state}>
        {/* The figure is the control. On-hand is live server state, not part of the item's
            definition, so it must never ride along in a form's Save — that would silently
            revert whatever sold while the form was open. Correcting it here writes a
            movement to the ledger, which is what makes the number auditable. */}
        <div className="stk-panel-top">
          <button className="stk-panel-qty" onClick={() => go({ k: 'recount', id: item.id })}>
            <b className="num">{qty(item.onHand, item.baseUnit)}</b>
            <i>{item.baseUnit === 'PIECE' ? t('PIECE') : unitTag(item.baseUnit, t)}</i>
            <em>{t('recount')}</em>
          </button>
          <p className="stk-panel-state" data-tone={label.tone}>{label.text}</p>
        </div>
        <Gauge item={item} className="tall" />
      </div>

      <div className="stk-facts">
        <div className="stk-fact">
          <span>{t('daysCover')}</span>
          {cover?.daysLeft != null ? (
            <b className="num">{Math.round(cover.daysLeft)} {dayWord(Math.round(cover.daysLeft), lang)}</b>
          ) : cover ? (
            /* Moving, but too little history to divide by. Says what it is waiting for rather
               than showing a dash that reads as "broken". */
            <b className="soft">
              {t('stLearning')}
              <em>{fill(t('learningDays'), {
                n: cover.observedDays ?? 0, d: dayWord(cover.observedDays ?? 0, lang),
              })}</em>
            </b>
          ) : <b>—</b>}
        </div>
        <div className="stk-fact">
          <span>{t('perDay')}</span>
          <b className="num">{cover?.dailyUsage != null
            ? `${qty(cover.dailyUsage, item.baseUnit)} ${unitTag(item.baseUnit, t)}` : '—'}</b>
        </div>
        <div className="stk-fact">
          <span>{t('costPack')}</span>
          <b className="num">{packCost > 0 ? <Money value={packCost} /> : '—'}</b>
        </div>
        <div className="stk-fact">
          <span>{t('orderAt')}</span>
          <b className={`num${item.reorderPoint == null ? ' soft' : ''}`}>
            {item.reorderPoint == null
              ? t('notSet')
              : `${qty(item.reorderPoint, item.baseUnit)} ${unitTag(item.baseUnit, t)}`}
          </b>
        </div>
      </div>

      {/* Why this number does or does not move by itself. */}
      {usedBy > 0 ? (
        <p className="stk-used">{fill(t('usedBy'), { n: usedBy })}</p>
      ) : (
        <button className="stk-used dead" onClick={() => go({ k: 'uses' })}>
          {t('usedByNone')}<em>{t('usedByFix')} →</em>
        </button>
      )}

      <div className="stk-panel-acts">
        <button className="key" onClick={() => go({ k: 'add', id: item.id })}>
          {t('addStock')}
        </button>
        <button onClick={() => go({ k: 'waste', itemId: item.id })}>{t('logWaste')}</button>
        <button onClick={() => go({ k: 'edit', id: item.id })}>{t('edit')}</button>
      </div>

      <div>
        <h5 className="stk-sec-h">{t('recent')}</h5>
        {moves.length === 0 ? (
          <p className="stk-hint">{t('noMovements')}</p>
        ) : (
          <div className="stk-moves">
            {moves.map((m) => <MoveLine key={m.id} m={m} t={t} unit={item.baseUnit} />)}
          </div>
        )}
      </div>
    </Sheet>
  );
}
