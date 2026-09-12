import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError, consumePrimedMenu } from '../../lib/api';
import { sellable } from '../../lib/types';
import type { OrderType, PublicMenu, PublicItem, ReturningCustomer, SelectedOption } from '../../lib/types';
import { deviceToken } from '../../lib/customerProfile';
import { track } from '../../lib/analytics';
import { discountPercent } from '../../lib/format';
import { Money } from '../../lib/Money';
import { useI18n, useT, pick, nameOf, LangToggle, Ltr, type Dict } from '../../lib/i18n';
import { useCartStore, useCart, qtyForItem, lineUnitPrice } from '../../lib/cart';
import { useToast } from '../../lib/toast';
import { useVenue, cartKeyOf, menuUrlOf, orderTypeFromPath } from './venue';
import { readMenuCache, writeMenuCache } from './menuCache';
import { parseMenuInfo, houseFacts } from './menuInfo';
import { usePresence } from './usePresence';
import { CustomerFrame } from './CustomerFrame';
import { ItemDetailModal } from './ItemDetailModal';
import { loyaltyCardStyle } from './StampCard';
import { FACT_ICONS, IconTimer, IconGift, IconTicket, IconCart, type FactIconKey } from './icons';
import './loyalty.css';

const DICT: Dict = {
  ar: { table: 'طاولة', viewCart: 'عرض السلة', items: 'أصناف', cur: 'ر.ع', min: 'د', from: 'يبدأ من',
        soldout: 'غير متوفر', left: 'بقي {n}', loading: 'جارٍ تحميل القائمة…', unavailable: 'القائمة غير متاحة حالياً', retry: 'إعادة المحاولة', car: 'طلب من السيارة', added: 'أُضيف ✓', menuOnly: 'القائمة',
        ordersPaused: 'الطلبات متوقفة مؤقتاً', ordersPausedSub: 'يمكنك تصفح القائمة، لكن هذا الفرع لا يستقبل طلبات جديدة حالياً.',
        browseHint: 'امسح رمز طاولتك أو رمز خدمة السيارة لإرسال طلب.',
        welcome: 'أهلاً بعودتك', usual: 'طلبك المعتاد', addUsual: '＋ أضف', lastOrderLbl: 'طلبك السابق', reorderLast: '↻ أضِفه للسلة', lastAdded: 'أُضيف طلبك السابق إلى السلة ✓',
        loyStamps: 'أختام', loyReady: 'مكافأتك جاهزة! 🎉', loyReadySub: 'استبدل مكافأتك المجانية عند الدفع', loyMinTag: 'الحد الأدنى',
        loyPickAny: 'اختر أي صنف:', qtyMinus: 'إنقاص الكمية', qtyPlus: 'زيادة الكمية', loyRewardBadge: 'مكافأة الولاء', loyFreeBadge: 'مجاني بمكافأتك' },
  en: { table: 'Table', viewCart: 'View cart', items: 'items', cur: 'OMR', min: 'min', from: 'from',
        soldout: 'Sold out', left: '{n} left', loading: 'Loading the menu…', unavailable: 'Menu is unavailable right now', retry: 'Try again', car: 'Car order', added: 'Added ✓', menuOnly: 'Menu',
        ordersPaused: 'Orders are paused', ordersPausedSub: 'You can browse the menu, but this branch is not accepting new orders right now.',
        browseHint: 'Scan your table’s QR or the car-service QR to place an order.',
        welcome: 'Welcome back', usual: 'Your usual', addUsual: '＋ Add', lastOrderLbl: 'Your last order', reorderLast: '↻ Add to cart', lastAdded: 'Your last order is in the cart ✓',
        loyStamps: 'stamps', loyReady: 'Your reward is ready! 🎉', loyReadySub: 'Redeem your free reward at checkout', loyMinTag: 'min order',
        loyPickAny: 'Pick any:', qtyMinus: 'Decrease quantity', qtyPlus: 'Increase quantity', loyRewardBadge: 'Loyalty reward', loyFreeBadge: 'Free with your reward' },
};

export default function MenuPage() {
  const { slug = '', branchId, tableToken } = useParams();
  const bId = branchId ? Number(branchId) : null;
  const token = tableToken ?? null;
  const { lang } = useI18n();
  const t = useT(DICT);
  const nav = useNavigate();
  const { pathname } = useLocation();
  const orderType = orderTypeFromPath(token, pathname);
  // A bare branch/restaurant menu (no table, not the car route) is browse-only — there's no
  // takeaway flow, so the menu is viewable but ordering controls are hidden.
  const routeOrderable = orderType !== null;

  const url = menuUrlOf(slug, bId, token);
  // Two fast paths: the fetch index.html primed before the bundle loaded, and the
  // last menu this device saw (shown immediately while the refetch runs).
  const cachedMenu = useMemo(() => readMenuCache(url), [url]);
  const { data, isLoading, isError, error, refetch, isPlaceholderData } = useQuery({
    queryKey: ['menu', url],
    queryFn: () => consumePrimedMenu<PublicMenu>(url) ?? api.get<PublicMenu>(url, { auth: false }),
    placeholderData: cachedMenu,
  });
  const acceptingOrders = data?.branch?.acceptingOrders ?? true;
  const orderable = routeOrderable && acceptingOrders;
  useEffect(() => {
    if (data && !isPlaceholderData) writeMenuCache(url, data);
  }, [data, isPlaceholderData, url]);

  const setVenue = useVenue((s) => s.setVenue);
  useEffect(() => {
    if (data) setVenue({ slug, branchId: bId, tableToken: token, orderType, restaurant: data.restaurant, branch: data.branch ?? null, table: data.table ?? null });
  }, [data, orderType]); // eslint-disable-line

  const cartKey = cartKeyOf(slug, bId, token, orderType);
  const cart = useCart(cartKey);
  // Select the two actions, not the whole store: an unselected useCartStore() subscribes the
  // menu to every cart in localStorage, so another table's cart re-rendered this one.
  const add = useCartStore((s) => s.add);
  const bump = useCartStore((s) => s.bump);
  const toast = useToast();
  const [openItem, setOpenItem] = useState<PublicItem | null>(null);
  const fctx = { restaurantSlug: slug, branchId: bId, qrTableToken: token };
  const addItem = (id: number) => { add(cartKey, id); track('ADD_TO_CART', fctx, { menuItemId: id }); toast(t('added')); };
  const addFromModal = (it: PublicItem, qty: number, options: SelectedOption[]) => {
    useCartStore.getState().addWithQty(cartKey, it.id, options.length ? options : null, qty);
    track('ADD_TO_CART', fctx, { menuItemId: it.id, quantity: qty });
    toast(t('added'));
    setOpenItem(null);
  };

  // Fire MENU_VIEW once per visit when an orderable menu loads — top of the funnel.
  const sentMenuView = useRef(false);
  useEffect(() => {
    if (!data || !orderable || sentMenuView.current) return;
    sentMenuView.current = true;
    track('MENU_VIEW', fctx);
  }, [data, orderable]); // eslint-disable-line react-hooks/exhaustive-deps

  // Returning customer (device token exists only after a previous order from this browser).
  const devTok = deviceToken();
  const { data: returning } = useQuery({
    queryKey: ['returning', slug, devTok],
    queryFn: () => api.get<ReturningCustomer | null>(
      `/api/public/restaurants/${encodeURIComponent(slug)}/returning?deviceToken=${encodeURIComponent(devTok!)}`,
      { auth: false }),
    enabled: !!slug && !!devTok,
    staleTime: 5 * 60_000,
  });

  // The house card: the cafe in its own words, above the categories, in every layout.
  // The note is strictly per-language — unlike a name, an absent note costs nothing, so a
  // blank Arabic note shows no card to Arabic readers rather than an English paragraph.
  const house = useMemo(() => parseMenuInfo(data?.restaurant?.menuInfoJson), [data?.restaurant?.menuInfoJson]);
  const houseNote = lang === 'ar' ? house.noteAr : house.noteEn;
  const facts = useMemo(() => houseFacts(data?.branch, data?.restaurant), [data?.branch, data?.restaurant]);
  const showHouse = house.show && (!!houseNote || facts.length > 0);

  const itemsById = useMemo(() => {
    const m = new Map<number, PublicItem>();
    data?.categories.forEach((c) => c.items.forEach((i) => m.set(i.id, i)));
    return m;
  }, [data]);

  // Loyalty reward eligibility: badge the items a full stamp card can claim free.
  const loyRewardIds = (returning?.loyalty?.enabled ? returning.loyalty.rewardItemIds : null) ?? [];
  const loyReady = (returning?.loyalty?.availableRewards ?? 0) > 0;
  // When the reward is redeemable against (nearly) the whole menu, badging each item says
  // nothing — it is the remainingToday rule again: a badge on every item is a badge on none.
  // The strip above the categories already says it once, which is where it belongs.
  const loyRewardIsAnything = useMemo(() => {
    if (loyRewardIds.length === 0) return false;
    const sellableIds = [...itemsById.values()].filter(sellable).map((i) => i.id);
    if (sellableIds.length === 0) return false;
    const covered = sellableIds.filter((id) => loyRewardIds.includes(id)).length;
    return covered / sellableIds.length >= 0.8;
  }, [loyRewardIds, itemsById]);

  const loyRewardNames = useMemo(
    () => loyRewardIds.map((id) => itemsById.get(id)).filter((it): it is PublicItem => !!it)
      .slice(0, 3).map((it) => pick(it, 'name', lang)),
    [loyRewardIds, itemsById, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Your usual": only with a strong repeat signal — ≥2 orders and the top item in ≥50% of them
  // (the repeat/explore threshold that keeps the banner from guessing on thin history).
  const usual = useMemo(() => {
    if (!returning || returning.orderCount < 2) return null;
    return returning.favorites.find((f) =>
      f.ordersContaining * 2 >= returning.orderCount && sellable(itemsById.get(f.menuItemId))) ?? null;
  }, [returning, itemsById]);
  const lastItems = useMemo(
    () => (returning?.lastOrder?.items ?? []).filter((i) => sellable(itemsById.get(i.menuItemId))),
    [returning, itemsById]);
  // An item with options (e.g. a required size) can't be added blind: the last order only
  // stores the item + quantity, not the choices made, so it must go through the picker —
  // otherwise it lands in the cart with no option selected and checkout blocks it with no
  // way to fix. No-option items add straight to the cart; the first option item opens the picker.
  const optionsOf = (id: number) => itemsById.get(id)?.optionGroups ?? [];
  const reorderLast = () => {
    let added = false;
    let toPick: PublicItem | null = null;
    lastItems.forEach((i) => {
      if (optionsOf(i.menuItemId).length > 0) {
        if (!toPick) toPick = itemsById.get(i.menuItemId) ?? null;
      } else {
        useCartStore.getState().addWithQty(cartKey, i.menuItemId, [], i.quantity);
        added = true;
      }
    });
    if (added) toast(t('lastAdded'));
    if (toPick) setOpenItem(toPick);
  };
  // "Your usual" quick-add: open the picker when the item needs a choice, else add directly.
  const addUsual = (id: number) => {
    const it = itemsById.get(id);
    if (it && optionsOf(id).length > 0) { setOpenItem(it); return; }
    addItem(id);
  };

  const count = cart.reduce((s, l) => s + l.qty, 0);
  const cartbarShown = count > 0 && orderable;
  const subtotal = cart.reduce((s, l) => {
    const it = itemsById.get(l.id);
    return s + (it ? lineUnitPrice(it, l.selectedOptions) : 0) * l.qty;
  }, 0);

  // Report live presence: "viewing" while browsing, "ordering" once they've added items —
  // including what's in the cart so the counter can see demand building up.
  usePresence(bId, token ?? (orderType === 'CAR' ? 'car' : 'browse'), count > 0,
    cart.map((l) => ({ menuItemId: l.id, quantity: l.qty })));

  // sticky category nav highlight
  const scrollRef = useRef<HTMLDivElement>(null);
  const navButtonsRef = useRef<Map<number, HTMLButtonElement>>(new Map());
  const [activeCat, setActiveCat] = useState<number | null>(null);
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !data) return;
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => { if (e.isIntersecting) setActiveCat(Number((e.target as HTMLElement).dataset.cat)); }),
      { root, rootMargin: '-10% 0px -75% 0px' },
    );
    data.categories.forEach((c) => { const el = document.getElementById('cat-' + c.id); if (el) io.observe(el); });
    setActiveCat(data.categories[0]?.id ?? null);
    return () => io.disconnect();
  }, [data]);

  useEffect(() => {
    if (activeCat == null) return;
    navButtonsRef.current.get(activeCat)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeCat]);

  const gotoCat = (id: number) => document.getElementById('cat-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (isLoading) return (
    <Frame>
      <div className="center" role="status">
        <div className="spinner" /><span className="sr-only">{t('loading')}</span>
      </div>
    </Frame>
  );
  if (isError || !data) {
    const msg = error instanceof ApiError ? error.message : t('unavailable');
    return (
      <Frame>
        <div className="empty" style={{ margin: 'auto' }}>
          <div className="big">S.</div>
          <h3>{t('unavailable')}</h3>
          <p>{msg}</p>
          <button className="btn ghost" style={{ marginTop: 16 }} onClick={() => refetch()}>{t('retry')}</button>
        </div>
      </Frame>
    );
  }

  const r = data.restaurant;
  // One language per page: the café's name in the language the customer is reading, not the
  // café's name in Arabic with an English subtitle underneath.
  const restaurantName = nameOf(r, lang);
  return (
    <Frame restaurantTheme={data.restaurant.theme} restaurantThemeCustomJson={data.restaurant.themeCustomJson}>
      <header className="c-hdr">
        <div className="c-hdr-top">
          <div className="c-brand">
            <div className={'c-mark' + (r.logoUrl ? ' has-logo' : '')}>
              {r.logoUrl ? <img src={r.logoUrl} alt={restaurantName} /> : restaurantName.charAt(0)}
            </div>
            <div>
              <h1>{restaurantName}</h1>
            </div>
          </div>
          <LangToggle />
        </div>
      </header>

      {!acceptingOrders
        ? <div className="c-closed-hint"><b>{t('ordersPaused')}</b><span>{t('ordersPausedSub')}</span></div>
        : !routeOrderable && <div className="c-browse-hint">{t('browseHint')}</div>}

      <nav className="c-nav">
        {data.categories.map((c) => (
          <button
            key={c.id}
            ref={(el) => {
              if (el) navButtonsRef.current.set(c.id, el);
              else navButtonsRef.current.delete(c.id);
            }}
            className={activeCat === c.id ? 'on' : ''}
            aria-current={activeCat === c.id ? 'true' : undefined}
            onClick={() => gotoCat(c.id)}
          >
            <span>{pick(c, 'name', lang)}</span>
            <em>{c.items.length}</em>
          </button>
        ))}
      </nav>

      <main className="c-scroll" ref={scrollRef}>
        {showHouse && (
          <section className="c-house">
            {houseNote && <p className="c-house-note">{houseNote}</p>}
            {facts.length > 0 && (
              <div className="c-house-facts">
                {facts.map((f) => {
                  const Icon = FACT_ICONS[f.key as FactIconKey];
                  const inner = <>{Icon ? <Icon /> : null}{f.ltr ? <Ltr>{f.text}</Ltr> : <bdi>{f.text}</bdi>}</>;
                  return f.href
                    ? <a className="c-fact" key={f.key} href={f.href} target="_blank" rel="noreferrer">{inner}</a>
                    : <span className="c-fact" key={f.key}>{inner}</span>;
                })}
              </div>
            )}
          </section>
        )}
        {returning?.loyalty?.enabled && (() => {
          const loy = returning.loyalty!;
          const ready = loy.availableRewards > 0;
          const dots = Math.min(loy.stampsRequired, 10);
          return (
            <Link to="/loyalty" state={{ from: pathname }}
              className={'loy-strip on-menu' + (ready ? ' ready' : '')} style={loyaltyCardStyle(loy.cardColor)}>
              <span className="loy-spark"><IconTicket size={18} /></span>
              <div className="loy-strip-main">
                {/* The pair is one machine-format value and has to be isolated: a slash
                    between two numeric runs resolves RTL, so 3 / 4 read as 4 / 3 on the
                    Arabic menu — the count looked like it had overshot the card. */}
                <b>{ready ? t('loyReady') : <><Ltr>{loy.stamps} / {loy.stampsRequired}</Ltr> {t('loyStamps')}</>}</b>
                <span>{ready
                  ? (loyRewardNames.length ? `${t('loyPickAny')} ${loyRewardNames.join(' · ')}` : t('loyReadySub'))
                  : <>{loy.rewardLabel}{loy.minOrderAmount ? <> · {t('loyMinTag')} <Money value={loy.minOrderAmount} /></> : null}</>}</span>
              </div>
              <div className="loy-mini" aria-hidden="true">
                {Array.from({ length: dots }).map((_, i) => (
                  <i key={i} className={ready || i < loy.stamps ? 'on' : ''} />
                ))}
              </div>
              <span className="loy-go">›</span>
            </Link>
          );
        })()}
        {orderable && (usual || lastItems.length > 0) && (
          <div className="c-usual">
            <h3><span className="wave">👋</span>{t('welcome')}{returning?.customerName ? (lang === 'ar' ? '، ' : ', ') + returning.customerName : ''}</h3>
            {lastItems.length > 0 && (
              <div className="c-last">
                <span className="c-last-lbl">{t('lastOrderLbl')}</span>
                <div className="c-last-items">
                  {lastItems.map((i) => (
                    <span className="c-last-chip" key={i.menuItemId}>
                      <span className="num"><Ltr>{i.quantity}×</Ltr></span> {lang === 'ar' ? (i.nameAr || i.nameEn) : (i.nameEn || i.nameAr)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="row">
              {usual && (
                <button className="btn-usual" onClick={() => addUsual(usual.menuItemId)}>
                  {t('addUsual')} {lang === 'ar' ? (usual.nameAr || usual.nameEn) : (usual.nameEn || usual.nameAr)}
                </button>
              )}
              {lastItems.length > 0 && <button className="btn-last" onClick={reorderLast}>{t('reorderLast')}</button>}
            </div>
          </div>
        )}
        {data.categories.map((c, ci) => (
          <section className="c-cat" id={'cat-' + c.id} data-cat={c.id} key={c.id}>
            <div className="c-cat-head">
              <h2>{pick(c, 'name', lang)}</h2>
              <span className="c-rule" />
              {lang === 'ar' && <span className="en">{c.nameEn}</span>}
            </div>
            {pick(c, 'description', lang) && <p className="c-cat-desc">{pick(c, 'description', lang)}</p>}
            {c.items.map((it, idx) => {
              const hasOptions = (it.optionGroups?.length ?? 0) > 0;
              const noOptLine = cart.find((l) => l.key === String(it.id));
              const inCart = qtyForItem(cart, it.id);
              // First few photos are likely the LCP element — fetch them eagerly at high
              // priority; everything below the fold lazy-loads as the customer scrolls.
              const eager = ci === 0 && idx < 4;
              const open = () => setOpenItem(it);
              // The rise is a welcome, not a queue: the stagger stops after the first handful.
              // Uncapped, item 25 of a long category sat at opacity 0 for a second and a half —
              // a customer scrolling fast scrolled into nothing.
              return (
                <article className={'c-item' + (sellable(it) ? '' : ' out')}
                  style={{ animationDelay: `${Math.min(idx, 6) * 60}ms` }} key={it.id}>
                  <button className={'c-thumb' + (it.imageUrl ? '' : ' is-empty')} type="button" onClick={open}
                    aria-label={pick(it, 'name', lang)}>
                    {it.imageUrl
                      ? <img src={it.imageUrl} alt="" decoding="async" loading={eager ? 'eager' : 'lazy'}
                          width={82} height={82}
                          {...({ fetchpriority: eager ? 'high' : 'low' } as object)} />
                      : <span className="glyph">{pick(it, 'name', lang).charAt(0)}</span>}
                    {it.images && it.images.length > 1 && <span className="c-thumb-more">＋{it.images.length}</span>}
                  </button>
                  {!sellable(it) && <span className="c-badge">{t('soldout')}</span>}
                  {/* A cap with a few left is worth a word — the last three cheesecakes sell
                      themselves. Silent above five; a badge on every item is a badge on none. */}
                  {sellable(it) && it.remainingToday != null && it.remainingToday <= 5 && (
                    <span className="c-badge c-badge-left">{t('left').replace('{n}', String(it.remainingToday))}</span>
                  )}
                  <div className="c-body">
                    <button className="c-body-btn" type="button" onClick={open}>
                      <h3>{pick(it, 'name', lang)}</h3>
                      {lang === 'ar' && it.nameEn && <div className="sub">{it.nameEn}</div>}
                      {pick(it, 'description', lang) && <p>{pick(it, 'description', lang)}</p>}
                    </button>
                    <div className="c-foot">
                      <div>
                        <div className="c-price">
                          {/* the qualifier leads the number in both languages: "from 1.600",
                              "يبدأ من ١٫٦٠٠" — trailing it read as "1.600 from" in English */}
                          {hasOptions && <span className="c-from">{t('from')}</span>}
                          {it.salePrice != null && (
                            <Money value={it.price} className="c-was num" />
                          )}
                          <Money value={it.salePrice ?? it.price} className={'num' + (it.salePrice != null ? ' c-sale' : '')} />
                          {it.salePrice != null && <span className="c-off"><Ltr>−{discountPercent(it.price, it.salePrice)}%</Ltr></span>}
                        </div>
                        {it.preparationTimeMinutes ? <div className="c-prep"><IconTimer size={13} /><span className="num">{it.preparationTimeMinutes}</span> {t('min')}</div> : null}
                        {loyRewardIds.includes(it.id) && !loyRewardIsAnything && (
                          <div className={'loy-item-badge' + (loyReady ? ' ready' : '')}>
                            <IconGift size={13} /> {loyReady ? t('loyFreeBadge') : t('loyRewardBadge')}
                          </div>
                        )}
                      </div>
                      {!orderable
                        ? null
                        : !sellable(it)
                        ? <button className="c-add" disabled>+</button>
                        : hasOptions
                          ? <button className={'c-add' + (inCart > 0 ? ' c-add-in' : '')} onClick={open} aria-label="add">
                              {inCart > 0 ? <span className="num">{inCart}</span> : '+'}
                            </button>
                          : noOptLine
                            ? <div className="c-qty">
                                {/* Same order as the modal's stepper — the two used to run
                                    opposite ways, so the button that added on the card
                                    removed in the picker. Minus first mirrors correctly
                                    in both directions. */}
                                <button aria-label={t('qtyMinus')} onClick={() => bump(cartKey, String(it.id), -1)}>−</button>
                                <span className="n num">{noOptLine.qty}</span>
                                <button aria-label={t('qtyPlus')} onClick={() => addItem(it.id)}>+</button>
                              </div>
                            : <button className="c-add" onClick={() => addItem(it.id)} aria-label="add">+</button>}
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        ))}
        <div className="c-bottom-spacer" />
      </main>

      {/* The menu's primary action, so it is a real button: tabbable, Enter/Space, focus ring.
          Off-screen (empty cart) it is disabled, which takes it out of the tab order too —
          a keyboard customer never tabs into a bar they cannot see. */}
      <button
        type="button"
        className={'c-cartbar' + (cartbarShown ? ' show' : '')}
        disabled={!cartbarShown}
        aria-hidden={!cartbarShown}
        onClick={() => nav('/cart')}
      >
        <span className="ico" aria-hidden="true"><IconCart size={18} /><span className="count" key={count}>{count}</span></span>
        <span className="lbl"><b>{t('viewCart')}</b><span>{count} {t('items')}</span></span>
        <Money value={subtotal} className="total num" />
        <span className="go" aria-hidden="true">‹</span>
      </button>

      {openItem && (
        <ItemDetailModal
          item={openItem}
          restaurantSlug={slug}
          branchId={bId}
          qrTableToken={token}
          orderable={orderable}
          onClose={() => setOpenItem(null)}
          onAdd={(qty, options) => addFromModal(openItem, qty, options)}
        />
      )}
    </Frame>
  );
}

function Frame({ children, restaurantTheme, restaurantThemeCustomJson }:
  { children: React.ReactNode; restaurantTheme?: string | null; restaurantThemeCustomJson?: string | null }) {
  const { restaurant } = useVenue();
  return <CustomerFrame restaurantTheme={restaurantTheme ?? restaurant?.theme} restaurantThemeCustomJson={restaurantThemeCustomJson ?? restaurant?.themeCustomJson}>{children}</CustomerFrame>;
}
