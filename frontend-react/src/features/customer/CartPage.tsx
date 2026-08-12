import { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { PublicMenu, PublicItem, OrderTracking, CreateOrderPayload, OrderType, LoyaltySummary } from '../../lib/types';
import { omr, estimateVat, round3, sanitizePhone } from '../../lib/format';
import { useI18n, useT, pick, type Dict } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import { useCartStore, useCart, lineUnitPrice } from '../../lib/cart';
import { CAR_COLORS, carColorOf } from '../../lib/carColors';
import { getStoredProfile, saveStoredProfile, deviceToken } from '../../lib/customerProfile';
import { track } from '../../lib/analytics';
import { useVenue, cartKeyOf, menuPathOf, menuUrlOf } from './venue';
import { usePresence } from './usePresence';
import { CustomerFrame } from './CustomerFrame';
import { loyaltyCardStyle } from './StampCard';
import './loyalty.css';

const DICT: Dict = {
  ar: { title: 'سلّتك', cur: 'ر.ع', empty: 'سلّتك فارغة', emptySub: 'أضف ما يطيب لك من القائمة.', back: 'العودة للقائمة',
        ordersPaused: 'الطلبات متوقفة مؤقتاً', ordersPausedSub: 'هذا الفرع لا يستقبل طلبات جديدة حالياً. يمكنك العودة لتصفح القائمة.', closedStamp: 'مغلق',
        carPlate: 'رقم لوحة السيارة العُمانية', carPlatePh: 'مثال: 1234 أ ب',
        carPlateHint: 'اختياري — اكتب الأرقام ثم الرمز', plateNum: 'الأرقام', plateCode: 'الرمز', carColor: 'لون السيارة',
        name: 'الاسم (اختياري)', nameReq: 'الاسم', nameRequired: 'الاسم مطلوب لطلبات السيارة',
        phoneRequired: 'الجوال مطلوب لطلبات السيارة',
        phone: 'الجوال', phoneOpt: 'الجوال (اختياري)', myCars: 'سياراتك المحفوظة', myPhones: 'أرقامك المحفوظة',
        note: 'ملاحظة على الطلب', notePh: 'مثال: بدون سكر…', itemNote: 'ملاحظة على الصنف…',
        subtotal: 'المجموع الفرعي', vat: 'ضريبة القيمة المضافة', total: 'الإجمالي',
        finalNote: 'يُحتسب الإجمالي النهائي من المقهى عند تأكيد الطلب.', place: 'إرسال الطلب', placing: 'جارٍ الإرسال…',
        loyStamps: 'أختام', redeemTitle: 'استخدم مكافأتك', redeemSub: 'صنف واحد مجاناً',
        chooseFree: 'اختر صنفك المجاني', freeTag: 'مجاني 🎁',
        rewardReady: 'لديك مكافأة مجانية!', addOneOf: 'أضف أحد هذه الأصناف لاستخدامها:',
        loyDiscount: 'مكافأة الولاء', myRewards: 'مكافآتي' },
  en: { title: 'Your cart', cur: 'OMR', empty: 'Your cart is empty', emptySub: 'Add something you love from the menu.', back: 'Back to menu',
        ordersPaused: 'Orders are paused', ordersPausedSub: 'This branch is not accepting new orders right now. You can return to browse the menu.', closedStamp: 'Closed',
        carPlate: 'Oman car plate', carPlatePh: 'e.g. 1234 AB',
        carPlateHint: 'Optional — numbers, then the letter code', plateNum: 'Numbers', plateCode: 'Code', carColor: 'Car color',
        name: 'Name (optional)', nameReq: 'Name', nameRequired: 'Name is required for car orders',
        phoneRequired: 'Phone is required for car orders',
        phone: 'Phone', phoneOpt: 'Phone (optional)', myCars: 'Your saved cars', myPhones: 'Your saved numbers',
        note: 'Order note', notePh: 'e.g. no sugar…', itemNote: 'Note for this item…',
        subtotal: 'Subtotal', vat: 'VAT', total: 'Total',
        finalNote: 'Final total is confirmed by the cafe when your order is accepted.', place: 'Place order', placing: 'Sending…',
        loyStamps: 'stamps', redeemTitle: 'Use your reward', redeemSub: 'one item free',
        chooseFree: 'Choose your free item', freeTag: 'FREE 🎁',
        rewardReady: 'You have a free reward!', addOneOf: 'Add one of these to use it:',
        loyDiscount: 'Loyalty reward', myRewards: 'My rewards' },
};

const thumb = (it: PublicItem) => it.imageUrl
  ? { backgroundImage: `url('${it.imageUrl}')` }
  : { backgroundImage: `linear-gradient(155deg, hsl(${(it.id * 47) % 360} 42% 34%) -30%, #15171C 70%)` };

export default function CartPage() {
  const { lang } = useI18n();
  const t = useT(DICT);
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();
  const qc = useQueryClient();
  const { slug, branchId, tableToken, restaurant, orderType: venueOrderType } = useVenue();
  const orderType: OrderType = venueOrderType ?? (tableToken ? 'DINE_IN' : 'CAR');

  const menuPath = menuPathOf(slug, branchId, tableToken, orderType);
  const cartKey = cartKeyOf(slug, branchId, tableToken, orderType);
  const cart = useCart(cartKey);
  const { bump, setNote, clear } = useCartStore();

  // At checkout they're firmly "ordering"; share the cart so staff can see it coming.
  usePresence(branchId, tableToken ?? 'car', true,
    cart.map((l) => ({ menuItemId: l.id, quantity: l.qty })));

  // Reaching the cart with items = checkout started (funnel stage).
  const sentCheckout = useRef(false);
  useEffect(() => {
    if (sentCheckout.current || cart.length === 0 || !slug) return;
    sentCheckout.current = true;
    track('CHECKOUT_STARTED', { restaurantSlug: slug, branchId: branchId ?? null, qrTableToken: tableToken ?? null });
  }, [cart.length, slug, branchId, tableToken]);

  const { data } = useQuery({
    queryKey: ['menu', slug ? menuUrlOf(slug, branchId, tableToken) : 'none'],
    queryFn: () => api.get<PublicMenu>(menuUrlOf(slug!, branchId, tableToken), { auth: false }),
    enabled: !!slug,
  });
  const itemsById = useMemo(() => {
    const m = new Map<number, PublicItem>();
    data?.categories.forEach((c) => c.items.forEach((i) => m.set(i.id, i)));
    return m;
  }, [data]);

  // Autofill from the last order placed on this device (saved on success below).
  const saved = useMemo(() => getStoredProfile(), []);
  const [name, setName] = useState(saved?.name ?? '');
  const [phone, setPhone] = useState(saved?.phone ?? '');
  const [plateNum, setPlateNum] = useState(saved?.plateNum ?? '');   // digits, e.g. 1234
  const [plateCode, setPlateCode] = useState(saved?.plateCode ?? ''); // letter code, e.g. أ ب
  const carPlate = `${plateNum} ${plateCode}`.replace(/\s+/g, ' ').trim();
  const [carColor, setCarColor] = useState(saved?.carColor ?? ''); // palette key, e.g. white
  const [note, setOrderNote] = useState('');
  const savedPhones = saved?.phones ?? [];
  const savedCars = saved?.cars ?? [];

  // Inline validation: which fields failed on the last submit attempt, and refs so a failed
  // submit can move focus to the first offending field instead of just showing a toast.
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);


  const subtotal = round3(cart.reduce((s, l) => {
      const it = itemsById.get(l.id);
      return s + (it ? lineUnitPrice(it, l.selectedOptions) : 0) * l.qty;
    }, 0));
  const vatEnabled = restaurant?.vatEnabled ?? false;
  const vat = round3(estimateVat(subtotal, restaurant?.vatRate ?? 0, vatEnabled));
  const total = round3(subtotal + vat);

  // Loyalty: once a phone is entered, fetch this café's stamp progress for it.
  const phoneDigits = phone.replace(/\D/g, '');
  const { data: loyalty } = useQuery({
    queryKey: ['loyalty-summary', slug, phoneDigits],
    queryFn: () => api.get<LoyaltySummary>(
      `/api/public/loyalty/summary?slug=${encodeURIComponent(slug!)}&phone=${encodeURIComponent(phone.trim())}`,
      { auth: false }),
    enabled: !!slug && phoneDigits.length >= 7,
    staleTime: 60_000,
  });
  // The reward is redeemable only when the customer has one AND an eligible item is in the cart.
  // The café now sets a LIST of eligible items — the customer picks which ONE is free.
  const rewardIds = (loyalty?.enabled ? loyalty.rewardItemIds : null) ?? [];
  const eligibleLines = rewardIds.length ? cart.filter((l) => rewardIds.includes(l.id)) : [];
  const canRedeem = !!(loyalty?.enabled && loyalty.availableRewards >= 1 && eligibleLines.length > 0);
  const [redeem, setRedeem] = useState(false);
  useEffect(() => { if (!canRedeem) setRedeem(false); }, [canRedeem]);
  // The explicit pick; falls back to the first eligible line still in the cart.
  const [pickedRewardId, setPickedRewardId] = useState<number | null>(null);
  const redeemItemId = canRedeem
    ? (pickedRewardId != null && eligibleLines.some((l) => l.id === pickedRewardId)
        ? pickedRewardId : eligibleLines[0].id)
    : null;
  const unitOf = (l: (typeof cart)[number]) => {
    const it = itemsById.get(l.id);
    return it ? round3(lineUnitPrice(it, l.selectedOptions)) : 0;
  };
  // One radio choice per distinct eligible item; the waived price mirrors the server's
  // pick of the cheapest line of that item (options can price the same item differently).
  const rewardChoices = (() => {
    const m = new Map<number, number>();
    for (const l of eligibleLines) {
      const u = unitOf(l);
      const cur = m.get(l.id);
      if (cur == null || u < cur) m.set(l.id, u);
    }
    return [...m].map(([id, price]) => ({ id, price }));
  })();
  const chosenMatches = redeemItemId != null ? eligibleLines.filter((l) => l.id === redeemItemId) : [];
  const freeLine = redeem && chosenMatches.length
    ? chosenMatches.reduce((a, b) => (unitOf(a) <= unitOf(b) ? a : b)) : undefined;
  const rewardDiscount = freeLine ? unitOf(freeLine) : 0;
  // Reward items still on this menu, to nudge a customer whose reward is ready but unusable.
  const rewardNames = rewardIds
    .map((id) => itemsById.get(id)).filter((it): it is PublicItem => !!it)
    .slice(0, 3).map((it) => pick(it, 'name', lang));
  // A redeemed reward waives the item's price AND its VAT, so a "free drink" is truly free.
  const rewardVat = redeem ? round3(estimateVat(rewardDiscount, restaurant?.vatRate ?? 0, vatEnabled)) : 0;
  const vatCharged = round3(vat - rewardVat);
  const grandTotal = Math.max(0, round3(total - rewardDiscount - rewardVat));

  const place = useMutation({
    mutationFn: () => {
      const normalizedPlate = carPlate.trim().replace(/\s+/g, ' ').toUpperCase();
      const payload: CreateOrderPayload = {
        restaurantSlug: slug!, branchId: branchId!, tableToken: orderType === 'DINE_IN' ? tableToken : null,
        orderType, customerName: name || null, customerPhone: phone || null,
        carPlate: orderType === 'CAR' ? normalizedPlate || null : null,
        carColor: orderType === 'CAR' ? (carColor || null) : null, customerNote: note || null,
        deviceToken: deviceToken(true),
        phoneToken: null,
        redeemReward: redeem,
        redeemItemId: redeem ? redeemItemId : null,
        items: cart.map((l) => ({
          menuItemId: l.id, quantity: l.qty, note: l.note || null,
          selectedOptions: l.selectedOptions?.length ? l.selectedOptions : null,
        })),
      };
      return api.post<OrderTracking>('/api/public/orders', payload, { auth: false });
    },
    onSuccess: (order) => {
      track('ORDER_PLACED', { restaurantSlug: slug!, branchId: branchId ?? null, qrTableToken: tableToken ?? null });
      clear(cartKey);
      saveStoredProfile({ name, phone, plateNum, plateCode, carColor });
      localStorage.setItem('cafeqr_lastOrder', order.trackingToken);
      // The order just consumed/earned stamps; drop the cached summary so a follow-up order
      // doesn't re-offer an already-spent reward (which the server would reject, failing the order).
      qc.invalidateQueries({ queryKey: ['loyalty-summary'] });
      nav(`/order/${order.trackingToken}`);
    },
    onError: (e) => toast(
      e instanceof ApiError && e.errorCode === 'BRANCH_NOT_ACCEPTING_ORDERS'
        ? t('ordersPaused')
        : e instanceof ApiError ? e.message : 'Error',
    ),
  });
  const submit = () => {
    // Phone is only mandatory for CAR orders (no table to anchor the order to); a table order
    // already carries its table id, so the phone there is purely opt-in for loyalty stamps.
    const nextErrors: { name?: string; phone?: string } = {};
    if (orderType === 'CAR' && !name.trim()) nextErrors.name = t('nameRequired');
    if (orderType === 'CAR' && !phone.trim()) nextErrors.phone = t('phoneRequired');
    setErrors(nextErrors);
    if (nextErrors.name) { nameRef.current?.focus(); return; }
    if (nextErrors.phone) { phoneRef.current?.focus(); return; }
    place.mutate();
  };

  if (data?.branch?.acceptingOrders === false) {
    return (
      <CustomerFrame>
        <header className="c-vhdr">
          <button className="c-back" onClick={() => nav(menuPath)} aria-label="back"><span className="arr">›</span></button>
          <h2>{t('title')}</h2>
        </header>
        <div className="c-vbody">
          <div className="c-closed-card">
            <span className="c-closed-sign" aria-hidden="true">{t('closedStamp')}</span>
            <h3>{t('ordersPaused')}</h3>
            <p>{t('ordersPausedSub')}</p>
            <button className="btn ghost" onClick={() => nav(menuPath)}>{t('back')}</button>
          </div>
        </div>
      </CustomerFrame>
    );
  }

  return (
    <CustomerFrame>
      <header className="c-vhdr">
        <button className="c-back" onClick={() => nav(menuPath)} aria-label="back"><span className="arr">›</span></button>
        <h2>{t('title')}</h2>
      </header>

      {cart.length === 0 ? (
        <div className="c-vbody"><div className="empty" style={{ margin: 'auto' }}>
          <div className="big">S.</div><h3>{t('empty')}</h3><p>{t('emptySub')}</p>
          <button className="btn ghost" style={{ marginTop: 16 }} onClick={() => nav(menuPath)}>{t('back')}</button>
        </div></div>
      ) : (
        <>
          <div className="c-vbody">
            {cart.map((l) => {
              const it = itemsById.get(l.id);
              if (!it) return null;
              return (
                <div className="c-line" key={l.key}>
                  <div className="c-thumb" style={thumb(it)}>{!it.imageUrl && <span className="glyph">{pick(it, 'name', lang).charAt(0)}</span>}</div>
                  <div className="c-line-main">
                    <h4>
                      {pick(it, 'name', lang)}
                      {freeLine?.key === l.key && <span className="loy-free-tag">{t('freeTag')}</span>}
                    </h4>
                    {l.selectedOptions?.length > 0 && (
                      <div className="c-line-opts">
                        {l.selectedOptions.map((sel) => {
                          const g = it.optionGroups?.find((x) => x.id === sel.optionGroupId);
                          const o = g?.options.find((x) => x.id === sel.optionId);
                          if (!g || !o) return null;
                          return <span className="c-opt-chip" key={sel.optionId}>{pick(o, 'name', lang)}</span>;
                        })}
                      </div>
                    )}
                    <div className="lp"><span className="num">{omr(lineUnitPrice(it, l.selectedOptions))}</span> {t('cur')}</div>
                    <textarea className="c-notein" rows={1} placeholder={t('itemNote')} value={l.note}
                      onChange={(e) => setNote(cartKey, l.key, e.target.value)} />
                  </div>
                  <div className="c-line-side">
                    <div className="c-qty">
                      <button onClick={() => useCartStore.getState().add(cartKey, l.id, l.selectedOptions)}>+</button>
                      <span className="n num">{l.qty}</span>
                      <button onClick={() => bump(cartKey, l.key, -1)}>−</button>
                    </div>
                    <div className="lt"><span className="num">{omr(lineUnitPrice(it, l.selectedOptions) * l.qty)}</span></div>
                  </div>
                </div>
              );
            })}

            {orderType === 'CAR' && (
              <>
                {savedCars.length > 1 && (
                  <div className="field" style={{ marginTop: 18 }}>
                    <label>{t('myCars')}</label>
                    <div className="saved-chips">
                      {savedCars.map((c) => {
                        const on = c.plateNum === plateNum && c.plateCode === plateCode;
                        return (
                          <button type="button" key={c.plateNum + c.plateCode} className={'saved-chip' + (on ? ' on' : '')}
                            onClick={() => { setPlateNum(c.plateNum); setPlateCode(c.plateCode); setCarColor(c.carColor); }}>
                            {c.carColor && <span className="cc-dot" style={{ background: carColorOf(c.carColor)?.hex ?? c.carColor }} />}
                            <span className="num">{c.plateNum}</span> {c.plateCode}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="plate-field" style={{ marginTop: 18 }}>
                  <div className="oman-plate">
                    <div className="oman-plate-hd">
                      <span className="op-flag">🇴🇲</span>
                      <span className="op-ar">سلطنة عُمان</span>
                      <span className="op-en">Sultanate of Oman</span>
                    </div>
                    <div className="oman-plate-bd">
                      <input className="op-num" inputMode="numeric" value={plateNum} aria-label={t('plateNum')}
                        maxLength={5} placeholder="1234"
                        onChange={(e) => setPlateNum(e.target.value.replace(/[^0-9٠-٩]/g, '').slice(0, 5))} />
                      <span className="op-div" />
                      <input className="op-code" inputMode="text" autoCapitalize="characters" value={plateCode} aria-label={t('plateCode')}
                        maxLength={5} placeholder="أ ب"
                        onChange={(e) => setPlateCode(e.target.value.replace(/[^A-Za-z؀-ۿ ]/g, '').replace(/\s+/g, ' ').toUpperCase().slice(0, 5))} />
                    </div>
                  </div>
                  <p className="plate-hint">{t('carPlateHint')}</p>
                </div>

                <div className="field">
                  <label>{t('carColor')}</label>
                  <div className="car-colors">
                    {CAR_COLORS.map((c) => (
                      <button type="button" key={c.key}
                        className={'car-sw' + (carColor === c.key ? ' on' : '') + (c.ring ? ' light' : '')}
                        style={{ ['--sw' as any]: c.hex }}
                        aria-pressed={carColor === c.key} aria-label={lang === 'ar' ? c.ar : c.en}
                        title={lang === 'ar' ? c.ar : c.en}
                        onClick={() => setCarColor((v) => (v === c.key ? '' : c.key))}>
                        <span className="dot" />
                        <span className="nm">{lang === 'ar' ? c.ar : c.en}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
            <div className="field">
              <label htmlFor="c-name">{orderType === 'CAR' ? t('nameReq') : t('name')}</label>
              <input id="c-name" ref={nameRef} value={name} autoComplete="name"
                aria-invalid={!!errors.name} aria-describedby={errors.name ? 'c-name-err' : undefined}
                onChange={(e) => { setName(e.target.value); if (errors.name) setErrors((er) => ({ ...er, name: undefined })); }}
                placeholder="…" />
              {errors.name && <p id="c-name-err" className="field-error" aria-live="polite">{errors.name}</p>}
            </div>
            <div className="field">
              <label htmlFor="c-phone">{orderType === 'CAR' ? t('phone') : t('phoneOpt')}</label>
              <input id="c-phone" ref={phoneRef} className="num" type="tel" inputMode="tel" autoComplete="tel"
                value={phone} placeholder="9XXXXXXX"
                aria-invalid={!!errors.phone} aria-describedby={errors.phone ? 'c-phone-err' : undefined}
                onChange={(e) => { setPhone(sanitizePhone(e.target.value)); if (errors.phone) setErrors((er) => ({ ...er, phone: undefined })); }} />
              {errors.phone && <p id="c-phone-err" className="field-error" aria-live="polite">{errors.phone}</p>}
              {savedPhones.length > 1 && (
                <div className="saved-chips">
                  {savedPhones.map((p) => (
                    <button type="button" key={p} className={'saved-chip num' + (p === phone ? ' on' : '')} onClick={() => setPhone(p)}>{p}</button>
                  ))}
                </div>
              )}
            </div>

            {loyalty?.enabled && loyalty.availableRewards < 1 && (
              <div className="loy-strip" style={loyaltyCardStyle(loyalty.cardColor)}
                onClick={() => nav('/loyalty', { state: { from: loc.pathname } })} role="button" tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && nav('/loyalty', { state: { from: loc.pathname } })}>
                <span className="loy-spark">🎟️</span>
                <div className="loy-strip-main">
                  <b><span className="num">{loyalty.stamps}</span> / <span className="num">{loyalty.stampsRequired}</span> {t('loyStamps')}</b>
                  <span>{loyalty.rewardLabel}</span>
                </div>
                <div className="loy-mini" aria-hidden="true">
                  {Array.from({ length: Math.min(loyalty.stampsRequired, 10) }).map((_, i) => (
                    <i key={i} className={i < loyalty.stamps ? 'on' : ''} />
                  ))}
                </div>
                <span className="loy-go">›</span>
              </div>
            )}
            {loyalty?.enabled && loyalty.availableRewards >= 1 && eligibleLines.length === 0 && (
              <div className="loy-strip ready" onClick={() => nav(menuPath)} role="button" tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && nav(menuPath)}>
                <span className="loy-spark">🎁</span>
                <div className="loy-strip-main">
                  <b>{t('rewardReady')}</b>
                  <span>{rewardNames.length ? `${t('addOneOf')} ${rewardNames.join(' · ')}` : loyalty.rewardLabel}</span>
                </div>
                <span className="loy-go">›</span>
              </div>
            )}
            {canRedeem && (
              <div className="loy-redeem">
                <label className="loy-redeem-head">
                  <span className="gift" aria-hidden="true">🎁</span>
                  <div className="loy-redeem-main">
                    <b>{t('redeemTitle')}</b>
                    <span>{loyalty?.rewardLabel} — {t('redeemSub')}</span>
                  </div>
                  <span className="loy-switch">
                    <input type="checkbox" checked={redeem} aria-label={t('redeemTitle')}
                      onChange={(e) => setRedeem(e.target.checked)} />
                    <span className="track" />
                  </span>
                </label>
                {redeem && rewardChoices.length > 1 && (
                  <div className="loy-free-pick" role="radiogroup" aria-label={t('chooseFree')}>
                    <b>{t('chooseFree')}</b>
                    {rewardChoices.map((c) => {
                      const it = itemsById.get(c.id);
                      return (
                        <label key={c.id} className={'loy-free-opt' + (redeemItemId === c.id ? ' on' : '')}>
                          <input type="radio" name="loy-free" checked={redeemItemId === c.id}
                            onChange={() => setPickedRewardId(c.id)} />
                          <span className="nm">{it ? pick(it, 'name', lang) : `#${c.id}`}</span>
                          <span className="pr num">−{omr(c.price)}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="field"><label>{t('note')}</label><textarea rows={2} value={note} onChange={(e) => setOrderNote(e.target.value)} placeholder={t('notePh')} /></div>

            <div className="c-totals">
              <div className="row"><span>{t('subtotal')}</span><span className="num">{omr(subtotal)} {t('cur')}</span></div>
              {vatEnabled && <div className="row"><span>{t('vat')} ({restaurant?.vatRate}%)</span><span className="num">{omr(vatCharged)} {t('cur')}</span></div>}
              {rewardDiscount > 0 && (
                <div className="row loy-discount"><span>🎁 {t('loyDiscount')}</span><span className="num">−{omr(rewardDiscount)} {t('cur')}</span></div>
              )}
              <div className="row grand"><span>{t('total')}</span><span className="num">{omr(grandTotal)} {t('cur')}</span></div>
              <div className="c-hint">{t('finalNote')}</div>
            </div>
          </div>

          <div className="c-foot-bar">
            <button className="btn full" disabled={place.isPending} onClick={submit}>
              {place.isPending ? t('placing') : <>{t('place')} · <span className="num">{omr(grandTotal)}</span></>}
            </button>
          </div>
        </>
      )}
    </CustomerFrame>
  );
}
