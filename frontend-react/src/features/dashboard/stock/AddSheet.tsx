import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { useI18n, pick } from '../../../lib/i18n';
import { useToast } from '../../../lib/toast';
import type { StockItemRow } from '../../../lib/types';
import { Sheet } from './parts';
import { human, humanParts, packLabel } from './units';

type T = (k: string) => string;

/** Packs a café actually takes in at once. Four is enough; a fifth is a decision, not a tap. */
const STEPS = [1, 2, 5, 10];

/**
 * Add more of one thing.
 *
 * <p>This is the whole reason the wall is tappable, and it is deliberately the shallowest
 * screen in the feature. Something arrived; say how much; done. The sheet it replaces asked
 * an owner to pick the item out of a dropdown of forty, choose whether they were speaking in
 * packs or in grams, and fill a table — a form for a thing that happens while somebody is
 * still holding the box.
 *
 * <p>Every quantity here is a pack, because a pack is what the invoice says and what the
 * hand is holding. The buttons are not labelled "1 pack" and "2 packs" either: they are
 * labelled with what lands — "1 kg", "2 kg", "250" — so nobody has to hold a conversion in
 * their head to press the right one. Grams and millilitres are the ledger's business and
 * appear nowhere on this screen.
 *
 * <p>Price is optional and folded away. It matters — it is what inventory value and the
 * order estimate are made of — but an owner who does not have the invoice to hand must not
 * be stopped from recording the stock, and a required field is a stop.
 */
export default function AddSheet({ t, branchId, item, queryKey, onClose, onRecount, onMore }: {
  t: T; branchId?: number; item: StockItemRow; queryKey: unknown[];
  onClose: () => void;
  /** The other thing that can be true: not "more arrived" but "the number is wrong". */
  onRecount: () => void;
  onMore: () => void;
}) {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [packs, setPacks] = useState('');
  const [price, setPrice] = useState('');
  const [showPrice, setShowPrice] = useState(false);

  const size = item.purchaseUnitSize > 0 ? item.purchaseUnitSize : 1;
  const n = Number(packs) || 0;
  const landing = n * size;
  const onHand = humanParts(item.onHand, item.baseUnit, lang);

  const save = useMutation({
    mutationFn: () => api.post('/api/dashboard/stock/receive', {
      branchId,
      lines: [{
        stockItemId: item.id,
        quantityBase: landing,
        // The café types what one pack cost; the ledger keeps cost per base unit.
        unitCost: Number(price) > 0 ? Number(price) / size : null,
      }],
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast(t('addedNow').replace('{q}', human(landing, item.baseUnit, lang)));
      onClose();
    },
    onError: (e: Error) => toast(e.message),
  });

  return (
    <Sheet title={pick(item, 'name', lang)} onClose={onClose}
      onSubmit={() => save.mutate()} submitLabel={t('addStock')} busy={save.isPending}
      problem={landing > 0 ? null : t('needAmount')}>

      {/* What is there now, stated before anything is asked. Somebody adding to a shelf is
          usually also checking it, and this is the number they came to see. */}
      <div className="stk-pad-now">
        <span>{t('onShelf')}</span>
        <b><i className="num">{onHand.n}</i> <em>{onHand.u}</em></b>
      </div>

      <div className="stk-pad">
        <span className="stk-sec-h">{t('howMuchArrived')}</span>
        <div className="stk-pad-keys" role="group" aria-label={t('howMuchArrived')}>
          {STEPS.map((s) => (
            <button key={s} type="button" aria-pressed={n === s}
              className={`stk-pad-key${n === s ? ' on' : ''}`}
              onClick={() => setPacks(n === s ? '' : String(s))}>
              {human(s * size, item.baseUnit, lang)}
            </button>
          ))}
        </div>

        {/* Deliveries are not always a round number of the pack you set up, and the way out
            has to be on the same screen rather than behind a mode switch. */}
        <label className="stk-pad-any">
          <span>{t('orPacks').replace('{pack}', packLabel(item.baseUnit, size, t))}</span>
          <input className="num" type="number" inputMode="decimal" min="0" step="0.01"
            dir="ltr" value={packs} onChange={(e) => setPacks(e.target.value)} />
        </label>
      </div>

      {showPrice ? (
        <label className="stk-f">
          <span>{t('pricePer').replace('{pack}', packLabel(item.baseUnit, size, t))}</span>
          <input className="num" type="number" inputMode="decimal" min="0" step="0.001"
            dir="ltr" value={price} autoFocus onChange={(e) => setPrice(e.target.value)} />
        </label>
      ) : (
        <button type="button" className="stk-pad-more" onClick={() => setShowPrice(true)}>
          {t('addPrice')}
        </button>
      )}

      {/* Always say what lands, in the unit the shelf is counted in. A wrong pack size is
          caught here or not until the next count. */}
      {landing > 0 && (
        <p className="stk-pad-lands">
          {t('landsOn').replace('{q}', human(item.onHand + landing, item.baseUnit, lang))}
        </p>
      )}

      <div className="stk-pad-else">
        <button type="button" onClick={onRecount}>{t('recount')}</button>
        <button type="button" onClick={onMore}>{t('moreAbout')}</button>
      </div>
    </Sheet>
  );
}
