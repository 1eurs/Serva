import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useI18n, useT, Ltr, type Dict } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import { omr, estimateVat, discountPercent, syncPhoneInput } from '../../lib/format';
import { lineUnitPrice, cartLineKey, effectiveBasePrice } from '../../lib/cart';
import { CAR_COLORS, carColorLabel } from '../../lib/carColors';
import type {
  Restaurant, PublicMenu, PublicItem, TableResponse, OrderType, BranchResponse,
  SelectedOption, CreateStaffOrderPayload, OrderResponse,
} from '../../lib/types';
import { sellable } from '../../lib/types';
import './orderpad.css';

/** How the customer settled at the counter. 'CARD' doubles as plain "paid" when the café
 *  doesn't split cash from card (mirrors the mark-paid default on the board). */
type PadPay = 'UNPAID' | 'CASH' | 'CARD';

interface PadLine { key: string; item: PublicItem; qty: number; note: string; selectedOptions: SelectedOption[] }

const DICT: Dict = {
  ar: {
    p_type: 'نوع الطلب', p_dinein: 'صالة', p_car: 'سيارة',
    p_table: 'الطاولة', p_noTable: 'بدون طاولة', p_plate: 'رقم اللوحة', p_color: 'اللون',
    p_name: 'اسم العميل', p_phone: 'الهاتف', p_note: 'ملاحظة', p_optional: 'اختياري',
    p_cart: 'الطلب', p_empty: 'أضف أصنافًا من القائمة', p_subtotal: 'المجموع', p_vat: 'ضريبة', p_total: 'الإجمالي',
    p_savings: 'الخصم', p_items: 'صنف',
    p_place: 'إرسال للمطبخ', p_placing: 'جارٍ…', p_sent: 'تم إرسال الطلب', p_clear: 'تفريغ',
    p_addOpts: 'اختر الخيارات', p_add: 'إضافة', p_required: 'مطلوب', p_qty: 'الكمية',
    p_search: 'بحث في القائمة…', p_all: 'الكل', p_noItems: 'لا أصناف متاحة', p_loading: 'جارٍ التحميل…',
    p_soldout: 'نفد',
    p_close: 'إغلاق',
    p_pay: 'الدفع', p_unpaid: 'لم يدفع', p_paid: 'مدفوع', p_cash: 'نقداً', p_card: 'بطاقة',
    p_placePaid: 'مدفوع · إرسال', p_send: 'إرسال', p_sendUnpaid: 'إرسال دون دفع',
  },
  en: {
    p_type: 'Order type', p_dinein: 'Dine-in', p_car: 'Car',
    p_table: 'Table', p_noTable: 'No table', p_plate: 'Plate number', p_color: 'Color',
    p_name: 'Customer name', p_phone: 'Phone', p_note: 'Note', p_optional: 'optional',
    p_cart: 'Order', p_empty: 'Add items from the menu', p_subtotal: 'Subtotal', p_vat: 'VAT', p_total: 'Total',
    p_savings: 'Discount', p_items: 'items',
    p_place: 'Send to kitchen', p_placing: 'Sending…', p_sent: 'Order sent', p_clear: 'Clear',
    p_addOpts: 'Choose options', p_add: 'Add', p_required: 'required', p_qty: 'Qty',
    p_search: 'Search the menu…', p_all: 'All', p_noItems: 'No available items', p_loading: 'Loading…',
    p_soldout: 'Sold out',
    p_close: 'Close',
    p_pay: 'Payment', p_unpaid: 'Not paid', p_paid: 'Paid', p_cash: 'Cash', p_card: 'Card',
    p_placePaid: 'Paid · Send', p_send: 'Send', p_sendUnpaid: 'Send, not paid',
  },
};

export default function OrderPad({ branchId, onPlaced }: { branchId?: number; onPlaced?: () => void }) {
  const { user } = useAuth();
  const { lang } = useI18n();
  const t = useT(DICT);
  const toast = useToast();
  const qc = useQueryClient();
  const rid = user!.restaurantId;

  const nm = (en: string, ar: string) => (lang === 'ar' ? ar || en : en || ar);

  const restaurantQ = useQuery({
    queryKey: ['restaurant', rid],
    queryFn: () => api.get<Restaurant>(`/api/restaurants/${rid}`),
    enabled: !!rid,
  });
  const slug = restaurantQ.data?.slug;
  const cur = restaurantQ.data?.currency ?? (lang === 'ar' ? 'ر.ع' : 'OMR');

  // The public branch menu is the only source that carries option groups + availability.
  const menuQ = useQuery({
    queryKey: ['pad-menu', slug, branchId],
    queryFn: () => api.get<PublicMenu>(`/api/public/restaurants/${slug}/branches/${branchId}/menu`),
    enabled: !!slug && !!branchId,
  });
  const tablesQ = useQuery({
    queryKey: ['tables', branchId],
    queryFn: () => api.get<TableResponse[]>(`/api/branches/${branchId}/tables`),
    enabled: !!branchId,
  });
  // Same cache key the Shell and board use — react-query dedupes it.
  const branchQ = useQuery({
    queryKey: ['branch', branchId],
    queryFn: () => api.get<BranchResponse>(`/api/branches/${branchId}`),
    enabled: !!branchId,
  });
  const counterMode = !!branchQ.data?.counterMode;
  const splitMethods = !!restaurantQ.data?.paymentMethodSelectionEnabled;

  const [lines, setLines] = useState<PadLine[]>([]);
  const [orderType, setOrderType] = useState<OrderType>('DINE_IN');
  const [tableId, setTableId] = useState<number | undefined>(undefined);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerNote, setCustomerNote] = useState('');
  const [carPlate, setCarPlate] = useState('');
  const [carColor, setCarColor] = useState('');
  const [pay, setPay] = useState<PadPay>('UNPAID');
  const [activeCat, setActiveCat] = useState<number | 'all'>('all');
  const [search, setSearch] = useState('');
  const [optionItem, setOptionItem] = useState<PublicItem | null>(null);

  const categories = menuQ.data?.categories ?? [];
  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return categories
      .filter((c) => activeCat === 'all' || c.id === activeCat)
      .flatMap((c) => c.items)
      .filter((it) => it.available)
      .filter((it) => !q || it.nameEn.toLowerCase().includes(q) || it.nameAr.includes(search.trim()));
  }, [categories, activeCat, search]);

  const subtotal = lines.reduce((sum, l) => sum + lineUnitPrice(l.item, l.selectedOptions) * l.qty, 0);
  // What the same lines would cost at full (pre-discount) price — the gap is the savings.
  const savings = lines.reduce((sum, l) => sum + Math.max(0, l.item.price - effectiveBasePrice(l.item)) * l.qty, 0);
  const vat = estimateVat(subtotal, restaurantQ.data?.vatRate ?? 0, restaurantQ.data?.vatEnabled ?? false);
  const total = subtotal + vat;
  const itemCount = lines.reduce((sum, l) => sum + l.qty, 0);

  const addLine = (item: PublicItem, selectedOptions: SelectedOption[], qty: number) => {
    const key = cartLineKey(item.id, selectedOptions);
    setLines((prev) => {
      const hit = prev.find((l) => l.key === key);
      return hit
        ? prev.map((l) => (l.key === key ? { ...l, qty: l.qty + qty } : l))
        : [...prev, { key, item, qty, note: '', selectedOptions }];
    });
  };
  const onItemClick = (item: PublicItem) => {
    if (item.optionGroups?.length) setOptionItem(item);
    else addLine(item, [], 1);
  };
  const bump = (key: string, d: number) =>
    setLines((prev) => prev.flatMap((l) => (l.key === key ? (l.qty + d <= 0 ? [] : [{ ...l, qty: l.qty + d }]) : [l])));
  const setNote = (key: string, note: string) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, note } : l)));

  const reset = () => {
    setLines([]); setCustomerName(''); setCustomerPhone(''); setCustomerNote('');
    setCarPlate(''); setCarColor(''); setTableId(undefined); setPay('UNPAID');
  };

  const place = useMutation({
    mutationFn: (pay: PadPay) => {
      const payload: CreateStaffOrderPayload = {
        branchId: branchId!,
        orderType,
        tableId: orderType === 'DINE_IN' ? tableId ?? null : null,
        customerName: customerName.trim() || null,
        customerPhone: customerPhone.trim() || null,
        carPlate: orderType === 'CAR' ? carPlate.trim() || null : null,
        carColor: orderType === 'CAR' ? carColor || null : null,
        customerNote: customerNote.trim() || null,
        paid: pay !== 'UNPAID',
        paymentMethod: pay === 'UNPAID' ? null : pay,
        items: lines.map((l) => ({
          menuItemId: l.item.id,
          quantity: l.qty,
          note: l.note.trim() || null,
          selectedOptions: l.selectedOptions.length ? l.selectedOptions : null,
        })),
      };
      return api.post<OrderResponse>('/api/dashboard/orders', payload);
    },
    onSuccess: (order) => {
      toast(`${t('p_sent')} · #${order.dailyNumber}`);
      // Counter mode: the ticket prints on arrival from the branch's print-station device (see
      // Shell → printOnArrival), which may or may not be this one — so nothing prints here.
      reset();
      qc.invalidateQueries({ queryKey: ['live'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      onPlaced?.();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  const canPlace = lines.length > 0 && !!branchId;

  if (!branchId) return <div className="pad-msg">—</div>;

  return (
    <div className="pad">
      <div className="pad-menu">
        <div className="pad-search">
          <input placeholder={t('p_search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="pad-cats">
          <button className={activeCat === 'all' ? 'on' : ''} onClick={() => setActiveCat('all')}>{t('p_all')}</button>
          {categories.map((c) => (
            <button key={c.id} className={activeCat === c.id ? 'on' : ''} onClick={() => setActiveCat(c.id)}>{nm(c.nameEn, c.nameAr)}</button>
          ))}
        </div>
        {menuQ.isLoading ? <div className="pad-msg">{t('p_loading')}</div>
          : visibleItems.length === 0 ? <div className="pad-msg">{t('p_noItems')}</div>
          : (
            <div className="pad-items">
              {visibleItems.map((it) => {
                const onSale = it.salePrice != null;
                const inCart = lines.filter((l) => l.item.id === it.id).reduce((s, l) => s + l.qty, 0);
                /* The kitchen cannot make it, so the counter must not sell it: the order would
                   be refused on the way to the ticket, in front of a customer who has already
                   been told a price. Greyed rather than dropped from the grid — a tile that
                   simply vanishes reads as a bug in the pad, not as an empty shelf. */
                const out = !sellable(it);
                return (
                  <button key={it.id} className={'pad-item' + (onSale ? ' sale' : '') + (out ? ' out' : '')}
                    disabled={out} onClick={() => onItemClick(it)}>
                    {out && <span className="pad-item-sold">{t('p_soldout')}</span>}
                    {!out && onSale && <span className="pad-item-off"><Ltr>−{discountPercent(it.price, it.salePrice!)}%</Ltr></span>}
                    {inCart > 0 && <span className="pad-item-incart">{inCart}</span>}
                    <span className="pad-item-nm">{nm(it.nameEn, it.nameAr)}</span>
                    <span className="pad-item-pr">
                      {onSale && <span className="pad-was">{omr(it.price)}</span>}
                      <span className={onSale ? 'pad-sale' : ''}>{omr(effectiveBasePrice(it))}</span>
                      {it.optionGroups?.length ? <span className="pad-plus">+</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
      </div>

      <div className="pad-cart">
        <div className="pad-types">
          {(['DINE_IN', 'CAR'] as OrderType[]).map((ty) => (
            <button key={ty} className={orderType === ty ? 'on' : ''} onClick={() => setOrderType(ty)}>
              {ty === 'DINE_IN' ? t('p_dinein') : t('p_car')}
            </button>
          ))}
        </div>

        {orderType === 'DINE_IN' && (
          <select className="select pad-field" value={tableId ?? ''} onChange={(e) => setTableId(e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">{t('p_noTable')}</option>
            {(tablesQ.data ?? []).filter((tb) => tb.active).map((tb) => <option key={tb.id} value={tb.id}>{tb.tableNumber}</option>)}
          </select>
        )}
        {orderType === 'CAR' && (
          <>
            <input className="pad-field" placeholder={`${t('p_plate')} (${t('p_optional')})`} value={carPlate} onChange={(e) => setCarPlate(e.target.value)} />
            <div className="pad-colors">
              {CAR_COLORS.map((c) => (
                <button key={c.key} type="button" title={carColorLabel(c.key, lang)}
                  className={'pad-color' + (carColor === c.key ? ' on' : '')}
                  style={{ background: c.hex, boxShadow: c.ring ? 'inset 0 0 0 1px var(--line-2)' : undefined }}
                  onClick={() => setCarColor((v) => (v === c.key ? '' : c.key))} />
              ))}
            </div>
          </>
        )}

        <div className="pad-cart-hd">
          <span>{t('p_cart')}</span>
          {itemCount > 0 && <span className="pad-count">{itemCount} {t('p_items')}</span>}
        </div>

        <div className="pad-lines">
          {lines.length === 0 ? <div className="pad-empty">{t('p_empty')}</div> : lines.map((l) => {
            const onSale = effectiveBasePrice(l.item) < l.item.price;
            return (
            <div key={l.key} className="pad-line">
              <div className="pad-line-top">
                <span className="pad-line-nm">{nm(l.item.nameEn, l.item.nameAr)}</span>
                <span className="pad-line-pr">
                  {onSale && <span className="pad-was">{omr((l.item.price + (lineUnitPrice(l.item, l.selectedOptions) - effectiveBasePrice(l.item))) * l.qty)}</span>}
                  {omr(lineUnitPrice(l.item, l.selectedOptions) * l.qty)}
                </span>
              </div>
              {l.selectedOptions.length > 0 && (
                <div className="pad-line-opts">{optsLabel(l, lang)}</div>
              )}
              <div className="pad-line-ctl">
                <div className="pad-qty">
                  <button onClick={() => bump(l.key, -1)}>−</button>
                  <b>{l.qty}</b>
                  <button onClick={() => bump(l.key, 1)}>＋</button>
                </div>
                <input className="pad-line-note" placeholder={t('p_note')} value={l.note} onChange={(e) => setNote(l.key, e.target.value)} />
              </div>
            </div>
            );
          })}
        </div>

        <div className="pad-cust">
          <input placeholder={`${t('p_name')} (${t('p_optional')})`} value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          <input className="num" placeholder={`${t('p_phone')} (${t('p_optional')})`} value={customerPhone} onChange={(e) => setCustomerPhone(syncPhoneInput(e.target))} inputMode="tel" />
        </div>

        <div className="pad-totals">
          <div><span>{t('p_subtotal')}</span><b>{omr(subtotal)} {cur}</b></div>
          {savings > 0 && <div className="pad-save"><span>{t('p_savings')}</span><b>−{omr(savings)} {cur}</b></div>}
          {vat > 0 && <div><span>{t('p_vat')}</span><b>{omr(vat)} {cur}</b></div>}
          <div className="pad-grand"><span>{t('p_total')}</span><b>{omr(total)} {cur}</b></div>
        </div>

        {counterMode ? (
          /* Counter mode: one tap records the payment AND sends. Whether that is one "Paid"
             button or a Cash / Card pair follows the café's "choose payment method at
             collection" setting, the same way the board's Collect button does — with it off,
             Card is recorded, as everywhere else. The unpaid path stays one tap too. */
          <div className="pad-actions pad-counter">
            {lines.length > 0 && <button className="pad-clear" onClick={reset}>{t('p_clear')}</button>}
            {splitMethods ? (
              <>
                <button className="pad-place cash" disabled={!canPlace || place.isPending} onClick={() => place.mutate('CASH')}>
                  💵 {t('p_cash')} · {t('p_send')}
                </button>
                <button className="pad-place card" disabled={!canPlace || place.isPending} onClick={() => place.mutate('CARD')}>
                  ▣ {t('p_card')} · {t('p_send')}
                </button>
              </>
            ) : (
              <button className="pad-place paid-one" disabled={!canPlace || place.isPending} onClick={() => place.mutate('CARD')}>
                ✓ {t('p_placePaid')}
              </button>
            )}
            <button className="pad-place unpaid" disabled={!canPlace || place.isPending} onClick={() => place.mutate('UNPAID')}>
              {place.isPending ? t('p_placing') : t('p_sendUnpaid')}
            </button>
          </div>
        ) : (
          <>
            <div className="pad-pay" role="radiogroup" aria-label={t('p_pay')}>
              <span className="pad-pay-lb">{t('p_pay')}</span>
              {(splitMethods ? (['UNPAID', 'CASH', 'CARD'] as PadPay[]) : (['UNPAID', 'CARD'] as PadPay[])).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={pay === k}
                  className={'pad-pay-opt' + (pay === k ? ' on' : '') + (k === 'UNPAID' ? ' none' : '')}
                  onClick={() => setPay(k)}>
                  {k === 'UNPAID' ? t('p_unpaid') : k === 'CASH' ? `💵 ${t('p_cash')}` : splitMethods ? `▣ ${t('p_card')}` : `✓ ${t('p_paid')}`}
                </button>
              ))}
            </div>

            <div className="pad-actions">
              {lines.length > 0 && <button className="pad-clear" onClick={reset}>{t('p_clear')}</button>}
              <button className={'pad-place' + (pay !== 'UNPAID' ? ' paid' : '')} disabled={!canPlace || place.isPending} onClick={() => place.mutate(pay)}>
                {place.isPending ? t('p_placing') : pay !== 'UNPAID' ? t('p_placePaid') : t('p_place')}
              </button>
            </div>
          </>
        )}
      </div>

      {optionItem && (
        <OptionSheet item={optionItem} t={t} nm={nm} onClose={() => setOptionItem(null)}
          onAdd={(opts, qty) => { addLine(optionItem, opts, qty); setOptionItem(null); }} />
      )}
    </div>
  );
}

function optsLabel(l: PadLine, lang: string): string {
  const names: string[] = [];
  for (const sel of l.selectedOptions) {
    for (const g of l.item.optionGroups ?? []) {
      const o = g.options.find((x) => x.id === sel.optionId);
      if (o) { names.push(lang === 'ar' ? o.nameAr || o.nameEn : o.nameEn || o.nameAr); break; }
    }
  }
  return names.join(' · ');
}

function OptionSheet({ item, t, nm, onAdd, onClose }: {
  item: PublicItem;
  t: (k: string) => string;
  nm: (en: string, ar: string) => string;
  onAdd: (opts: SelectedOption[], qty: number) => void;
  onClose: () => void;
}) {
  // chosen[groupId] = Set of optionIds (single groups keep one).
  const [chosen, setChosen] = useState<Record<number, number[]>>({});
  const [qty, setQty] = useState(1);
  const groups = item.optionGroups ?? [];

  const pick = (groupId: number, optionId: number, single: boolean) => {
    setChosen((prev) => {
      const cur = prev[groupId] ?? [];
      if (single) return { ...prev, [groupId]: cur[0] === optionId ? [] : [optionId] };
      return { ...prev, [groupId]: cur.includes(optionId) ? cur.filter((x) => x !== optionId) : [...cur, optionId] };
    });
  };

  const missingRequired = groups.some((g) => g.required && g.selectionType === 'SINGLE' && !(chosen[g.id]?.length));
  const flat: SelectedOption[] = groups.flatMap((g) => (chosen[g.id] ?? []).map((optionId) => ({ optionGroupId: g.id, optionId })));
  const unit = lineUnitPrice(item, flat);

  return (
    <div className="pad-sheet-bg" onClick={onClose}>
      <div className="pad-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="pad-sheet-hd"><b>{nm(item.nameEn, item.nameAr)}</b><button className="x" onClick={onClose}>✕</button></div>
        <div className="pad-sheet-bd">
          {groups.map((g) => (
            <div key={g.id} className="pad-grp">
              <div className="pad-grp-hd">{nm(g.nameEn, g.nameAr)}{g.required && <span className="pad-req">{t('p_required')}</span>}</div>
              {g.options.map((o) => {
                const on = (chosen[g.id] ?? []).includes(o.id);
                return (
                  <button key={o.id} className={'pad-opt' + (on ? ' on' : '')} onClick={() => pick(g.id, o.id, g.selectionType === 'SINGLE')}>
                    <span>{nm(o.nameEn, o.nameAr)}</span>
                    <span className="pad-opt-d">{o.priceDelta ? `+${omr(o.priceDelta)}` : ''}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="pad-sheet-ft">
          <div className="pad-qty">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button><b>{qty}</b><button onClick={() => setQty((q) => q + 1)}>＋</button>
          </div>
          <button className="pad-place" disabled={missingRequired} onClick={() => onAdd(flat, qty)}>
            {t('p_add')} · {omr(unit * qty)}
          </button>
        </div>
      </div>
    </div>
  );
}
