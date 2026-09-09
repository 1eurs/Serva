import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useI18n, useT, pick, ltrText } from '../../../lib/i18n';
import { useToast } from '../../../lib/toast';
import { Money } from '../../../lib/Money';
import type {
  CoverRow, MenuLinkRow, PurchaseOrderRow, ReorderSuggestion,
  Restaurant, StockItemRow, StockOverview,
} from '../../../lib/types';
import { DICT } from './copy';
import { agoWords, withMoney } from './parts';
import { fill, packLabel, qty, unitTag } from './units';
import Shelf from './Shelf';
import FirstRun from './FirstRun';
import ItemSheet from './ItemSheet';
import ItemForm from './ItemForm';
import CountFlow from './CountFlow';
import { DeliverySheet, RecountSheet, WasteSheet } from './LogSheets';
import Uses from './Uses';
import './stock.css';

type T = (k: string) => string;

/**
 * Every sheet on the feature is opened from one place, so any screen can open any of them.
 */
export type SheetReq =
  | { k: 'delivery'; itemId?: number }
  | { k: 'waste'; itemId?: number }
  | { k: 'recount'; id: number }
  | { k: 'edit'; id: number | null }
  | { k: 'item'; id: number }
  | { k: 'uses' }
  | { k: 'count' };

/**
 * Stock, rebuilt around one question: what do I do now?
 *
 * <p>The screen this replaces was a state dashboard. It showed a room gauge, an inventory
 * value, three collapsed strips, a chip rail carrying three different shades of worry, a
 * "Needs you" group, aisle groups, a standing rule and a second tab — eight instruments,
 * each individually defensible, and no answer to the only question an owner actually opens
 * stock with. Owners told us, in order: they did not know what the page wanted from them;
 * the setup was hard; the numbers never moved; and they did not believe the numbers.
 *
 * <p>So the page is now three things, top to bottom, and never more:
 *
 * <ol>
 *   <li><b>One job.</b> Exactly one card, naming exactly one action, chosen from where the
 *       café actually is. The commonest one — the order list — is the payoff of the whole
 *       feature and is never behind a "Show" button again.</li>
 *   <li><b>The receipts.</b> One quiet line saying when the shelf was last counted, what is
 *       on it, and what is already on its way. Every figure the page prints stands on those,
 *       and a figure with no date on it is one nobody can check.</li>
 *   <li><b>The shelf.</b> One list, always open, drawn against a single vertical order line
 *       that runs the length of it — so "what needs buying" is a shape, not a reading task.</li>
 * </ol>
 *
 * <p>The two halves of stock are still two halves, but the second one is no longer a tab
 * nobody opened. What a sale takes is asked while an item is being added, named as a
 * consequence when it is missing, and reachable from any row it affects.
 */
export default function StockPage({ branchId }: { branchId?: number | null }) {
  const { user } = useAuth();
  const t = useT(DICT);
  const { lang } = useI18n();

  /* The count lives in the URL, alone among the sheets. It is the one thing here a person is
     sent to rather than finds: an owner WhatsApps the link to whoever is closing tonight and
     it opens on the walk instead of on a page they then have to read. "sweep" is the path it
     shipped under and those links are in people's chats, so it still answers. */
  const location = useLocation();
  const navigate = useNavigate();
  const onCountUrl = /^\/dashboard\/stock\/(count|sweep)\/?$/.test(location.pathname);

  const [sheet, setSheet] = useState<SheetReq | null>(null);

  const scope = branchId ?? undefined;
  const key = ['stock', scope ?? 'me'];
  const suffix = scope ? `?branchId=${scope}` : '';

  const overviewQ = useQuery({
    queryKey: [...key, 'overview'],
    queryFn: () => api.get<StockOverview>(`/api/dashboard/stock/overview${suffix}`),
  });
  const itemsQ = useQuery({
    queryKey: [...key, 'items'],
    queryFn: () => api.get<StockItemRow[]>(`/api/dashboard/stock/items${suffix}`),
  });
  /* How long what is on the shelf will last at the recent rate. Open to every plan, and the
     single most useful number here — "2 days" beats "820 g" for deciding anything. */
  const coverQ = useQuery({
    queryKey: [...key, 'cover'],
    queryFn: () => api.get<CoverRow[]>(`/api/dashboard/stock/insights/cover${suffix}`),
    retry: false,
  });
  const suggestQ = useQuery({
    queryKey: [...key, 'suggestions'],
    queryFn: () => api.get<ReorderSuggestion[]>(`/api/dashboard/stock/reorder-suggestions${suffix}`),
  });
  /* Shared key with the Uses screen, so opening it costs nothing. The page needs one number
     out of this — whether anything at all draws on the shelf — and that number is the
     difference between a working feature and a shelf that never moves. */
  const linksQ = useQuery({
    queryKey: [...key, 'menu-links'],
    queryFn: () => api.get<MenuLinkRow[]>(`/api/dashboard/stock/menu-links${suffix}`),
  });
  const ordersQ = useQuery({
    queryKey: [...key, 'open-orders'],
    queryFn: () => api.get<PurchaseOrderRow[]>(
      `/api/dashboard/stock/purchase-orders?openOnly=true${scope ? `&branchId=${scope}` : ''}`),
    retry: false,
  });

  const items = itemsQ.data ?? [];
  const overview = overviewQ.data;
  const suggestions = suggestQ.data ?? [];
  const links = linksQ.data ?? [];
  const cover = useMemo(
    () => new Map((coverQ.data ?? []).map((c) => [c.stockItemId, c])),
    [coverQ.data],
  );
  const openOrders = (ordersQ.data ?? []).filter((o) => o.lines.some((l) => l.outstandingBase > 0));

  /* Deliberately capped or wired up — either way, not outstanding work. An owner who has
     finished every recipe they wanted should not be told for ever that one is missing. */
  const settled = links.filter((l) => l.stockMode === 'DAILY_LIMIT' || l.takes.length > 0).length;

  if (!user) return null;

  const openSheet = (s: SheetReq) => {
    if (s.k === 'count') { navigate('/dashboard/stock/count'); return; }
    setSheet(s);
  };
  const closeCount = () => navigate('/dashboard/stock');
  const byId = (id: number) => items.find((i) => i.id === id);

  const loading = itemsQ.isLoading || overviewQ.isLoading;

  return (
    <div className="tables-wrap stock-page">
      {loading ? (
        <div className="center"><div className="spinner" /></div>
      ) : items.length === 0 ? (
        <FirstRun t={t} onAdd={() => openSheet({ k: 'edit', id: null })} />
      ) : (
        <>
          <NowCard t={t} overview={overview} suggestions={suggestions} items={items}
            menu={links.length} settled={settled} branchId={scope} queryKey={key}
            openSheet={openSheet} />

          <Receipts t={t} overview={overview} orders={openOrders} items={items}
            branchId={scope} queryKey={key} openSheet={openSheet} />

          {/* The sentence the product owed an owner and never said. Shown whenever it is
              true and the card above is busy with something else, because an owner who
              cannot see this concludes the feature is broken rather than unfinished. */}
          {links.length > 0 && settled === 0 && suggestions.length > 0 && (
            <button className="stk-loop" onClick={() => openSheet({ k: 'uses' })}>
              <b>{t('loopDead')}</b>
              <span>{fill(t('loopDeadSub'), { n: links.length - settled, total: links.length })}</span>
              <em>{t('loopFix')} →</em>
            </button>
          )}

          <SoldOut t={t} overview={overview} openSheet={openSheet} />

          <Shelf t={t} items={items} cover={cover} openSheet={openSheet} />

          <AutoHideRule t={t} hidden={(overview?.soldOut ?? []).length} />
        </>
      )}

      {sheet?.k === 'delivery' && (
        <DeliverySheet t={t} branchId={scope} items={items} queryKey={key}
          initialItemId={sheet.itemId} onClose={() => setSheet(null)} />
      )}
      {sheet?.k === 'waste' && (
        <WasteSheet t={t} branchId={scope} items={items} queryKey={key}
          initialItemId={sheet.itemId} onClose={() => setSheet(null)} />
      )}
      {sheet?.k === 'recount' && byId(sheet.id) && (
        <RecountSheet t={t} branchId={scope} queryKey={key} item={byId(sheet.id)!}
          onClose={() => setSheet(null)} />
      )}
      {sheet?.k === 'edit' && (
        <ItemForm t={t} branchId={scope} queryKey={key}
          item={sheet.id == null ? null : byId(sheet.id) ?? null}
          categories={[...new Set(items.map((i) => i.category?.trim()).filter(Boolean) as string[])].sort()}
          onClose={() => setSheet(null)} />
      )}
      {sheet?.k === 'item' && byId(sheet.id) && (
        <ItemSheet t={t} branchId={scope} item={byId(sheet.id)!} cover={cover.get(sheet.id)}
          links={links} openSheet={openSheet} onClose={() => setSheet(null)} />
      )}
      {sheet?.k === 'uses' && (
        <Uses branchId={scope} items={items} onClose={() => setSheet(null)} />
      )}
      {onCountUrl && (
        <CountFlow branchId={scope} items={items} queryKey={key}
          onClose={closeCount}
          onSeeOrder={() => { closeCount(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
      )}
    </div>
  );
}

/* ================================================================== the one job */

/**
 * One card, one job, chosen by where the café actually is.
 *
 * <p>The order in which these are asked for is the order in which they are worth doing, and
 * every branch of it ends in a button whose label is a verb. Nothing here is collapsed:
 * whichever job is on screen, the whole of it is on screen, because the reason an owner
 * stopped reading the old page was that the useful part was always one tap further in.
 */
function NowCard({ t, overview, suggestions, items, menu, settled, branchId, queryKey, openSheet }: {
  t: T; overview?: StockOverview; suggestions: ReorderSuggestion[]; items: StockItemRow[];
  menu: number; settled: number; branchId?: number; queryKey: unknown[];
  openSheet: (s: SheetReq) => void;
}) {
  const { lang } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();

  /* Copying the list into WhatsApp *is* placing the order — there is no second screen where
     an owner would go and say so, and asking for that tap is the bookkeeping this feature
     exists to avoid. So the same action records it, which is what lets the shelf stop asking
     for beans that are already on the van. */
  const send = useMutation({
    mutationFn: () => api.post(
      `/api/dashboard/stock/purchase-orders/from-suggestions?send=true${branchId ? `&branchId=${branchId}` : ''}`),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: (e: Error) => toast(e.message),
  });

  const counted = overview?.readiness?.counted ?? 0;
  const lastCount = overview?.readiness?.lastCountAt ?? null;
  const countedToday = lastCount != null
    && new Date(lastCount).toDateString() === new Date().toDateString();

  /* Always in the unit they actually buy in — nobody orders "2400 grams of beans". Described
     from the pack's size rather than a stored label, because that label is one string in one
     language and this text is also the message that goes to the supplier. */
  const amount = (s: ReorderSuggestion) =>
    (s.suggestedPurchaseUnits != null
      ? `${ltrText(s.suggestedPurchaseUnits + ' ×')} ${packLabel(s.baseUnit, s.purchaseUnitSize, t)}`
      : `${qty(s.suggestedBase, s.baseUnit)} ${unitTag(s.baseUnit, t)}`);

  const estimate = suggestions.reduce((sum, s) => {
    const item = items.find((i) => i.id === s.stockItemId);
    return sum + (item ? s.suggestedBase * Number(item.costPerBaseUnit || 0) : 0);
  }, 0);

  const copy = async () => {
    const text = suggestions.map((s) => `• ${pick(s, 'name', lang)} — ${amount(s)}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast(t('jobOrderCopied'));
    } catch {
      /* The clipboard failing does not mean the order was not placed — the owner still means
         to send it, and can select the list by hand. Recording it either way is the choice
         that leaves the shelf honest. */
      toast(t('jobOrderFailed'));
    }
    send.mutate();
  };

  /* Nothing counted at all is the only state where the order list cannot be trusted, so it
     outranks it. After that the payoff comes first: money about to be lost beats setup. */
  const job = counted === 0 ? 'count'
    : suggestions.length > 0 ? 'order'
      : menu > 0 && settled === 0 ? 'uses'
        : !countedToday ? 'count'
          : 'clear';

  return (
    <section className={`stk-now stk-now-${job}`} aria-live="polite">
      <span className="stk-eyebrow">{t('jobEyebrow')}</span>

      {job === 'order' && (
        <>
          <h2>{fill(t('jobOrder'), { n: suggestions.length })}</h2>
          <p className="stk-now-sub">{t('jobOrderSub')}</p>
          <ul className="stk-order">
            {suggestions.map((s) => (
              <li key={s.stockItemId}>
                <span>{pick(s, 'name', lang)}</span>
                <b className="num">{amount(s)}</b>
              </li>
            ))}
          </ul>
          <div className="stk-now-do">
            <button className="key" onClick={copy} disabled={send.isPending}>
              {t('jobOrderGo')}
            </button>
            {estimate > 0 && (
              <span className="stk-now-est">{withMoney(t('jobOrderEst'), estimate)}</span>
            )}
          </div>
        </>
      )}

      {job === 'count' && (
        <>
          <h2>{t('jobCount')}</h2>
          <p className="stk-now-sub">
            {counted === 0
              ? t('jobCountNew')
              : fill(t('jobCountStale'), { when: agoWords(lastCount, t, lang) ?? '—' })}
          </p>
          <div className="stk-now-do">
            <button className="key" onClick={() => openSheet({ k: 'count' })}>
              {t('jobCountGo')}
            </button>
          </div>
        </>
      )}

      {job === 'uses' && (
        <>
          <h2>{t('jobUses')}</h2>
          <p className="stk-now-sub">
            {fill(t('loopDeadSub'), { n: menu - settled, total: menu })}
          </p>
          <div className="stk-now-do">
            <button className="key" onClick={() => openSheet({ k: 'uses' })}>
              {t('jobUsesGo')}
            </button>
          </div>
        </>
      )}

      {job === 'clear' && (
        <>
          <h2>{t('jobClear')}</h2>
          <p className="stk-now-sub">{t('jobClearSub')}</p>
        </>
      )}
    </section>
  );
}

/* ================================================================== receipts */

/**
 * Where the numbers came from, in one line.
 *
 * <p>Owners said they did not trust the figures, and a figure printed with no date beside it
 * is one nobody can check. So the page carries its evidence: when somebody last looked at a
 * shelf, what that shelf is worth, and what has already been ordered and not arrived. The
 * middle one is a fact; the other two are also the two ways the figures can be wrong, and
 * both of them open the thing that fixes it.
 */
function Receipts({ t, overview, orders, items, branchId, queryKey, openSheet }: {
  t: T; overview?: StockOverview; orders: PurchaseOrderRow[]; items: StockItemRow[];
  branchId?: number; queryKey: unknown[]; openSheet: (s: SheetReq) => void;
}) {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [openWay, setOpenWay] = useState(false);

  /* Suppliers do not always turn up. Without a way back, an order that never arrived would
     silently suppress its own items from the list for ever. */
  const cancel = useMutation({
    mutationFn: (id: number) =>
      api.patch(`/api/dashboard/stock/purchase-orders/${id}/status?status=CANCELLED`),
    onSuccess: () => { qc.invalidateQueries({ queryKey }); toast(t('putBack')); },
    onError: (e: Error) => toast(e.message),
  });

  const lastCount = overview?.readiness?.lastCountAt ?? null;
  const lines = orders.flatMap((o) => o.lines.filter((l) => l.outstandingBase > 0));

  /* Said the way it was ordered — "12 × 2 L", not "24000.0 ml". This list is read straight
     after the one it was copied from, against a message already sent to a supplier. */
  const outstanding = (l: (typeof lines)[number]) => {
    const item = items.find((i) => i.id === l.stockItemId);
    const size = item && item.purchaseUnitSize > 0 ? item.purchaseUnitSize : 0;
    return size > 0 && l.outstandingBase >= size
      ? `${ltrText(Math.ceil(l.outstandingBase / size) + ' ×')} ${packLabel(l.baseUnit, size, t)}`
      : `${qty(l.outstandingBase, l.baseUnit)} ${unitTag(l.baseUnit, t)}`;
  };

  return (
    <div className="stk-receipts">
      <div className="stk-receipt-row">
        <button className="stk-receipt" onClick={() => openSheet({ k: 'count' })}>
          <b>{lastCount ? agoWords(lastCount, t, lang) : t('countedNever')}</b>
          <span>{lastCount ? t('counted').replace(' {when}', '') : ''}</span>
        </button>

        {overview && (
          <div className="stk-receipt as-fact">
            <b className="num"><Money value={overview.inventoryValue} /></b>
            <span>{t('onShelves')}</span>
          </div>
        )}

        {lines.length > 0 && (
          <button className="stk-receipt" aria-expanded={openWay} onClick={() => setOpenWay(!openWay)}>
            <b className="num">{lines.length}</b>
            <span>{t('onWay').replace('{n} ', '')} <i aria-hidden>▾</i></span>
          </button>
        )}
      </div>

      {openWay && lines.length > 0 && (
        <div className="stk-way">
          <p className="stk-hint">{t('onWayNote')}</p>
          <ul className="stk-order">
            {lines.map((l) => (
              <li key={l.id}>
                <span>{pick({ nameEn: l.nameEn ?? '', nameAr: l.nameAr ?? '' }, 'name', lang)}</span>
                <b className="num">{outstanding(l)}</b>
              </li>
            ))}
          </ul>
          {orders.map((o) => (
            <button key={o.id} className="stk-mini" disabled={cancel.isPending}
              onClick={() => cancel.mutate(o.id)}>{t('notComing')}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================== sold out */

/**
 * The café's one automatic behaviour, read from a single place, so the alert that reports it
 * and the switch that governs it can never contradict each other.
 */
function useAutoHide() {
  const restaurantId = useAuth().user?.restaurantId;
  const query = useQuery({
    queryKey: ['restaurant', restaurantId],
    queryFn: () => api.get<Restaurant>(`/api/restaurants/${restaurantId}`),
    enabled: restaurantId != null,
    retry: false,
  });
  return { restaurantId, restaurant: query.data, autoHide: query.data?.autoHideOutOfStock ?? true };
}

const RULE_ID = 'stk-auto-hide-rule';

/** Scrolls the standing rule into view and marks it, from wherever its effect is being read. */
function revealRule() {
  const el = document.getElementById(RULE_ID);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.dataset.flash = 'on';
  window.setTimeout(() => { delete el.dataset.flash; }, 1600);
}

/**
 * What customers can no longer order, and the one thing to buy to fix it.
 *
 * <p>This is the most expensive thing the feature can do to a café — money not being taken,
 * right now — so it sits above the shelf and is never collapsed. It is not the "job" card,
 * because it is a consequence rather than a task: the fix for it is buying something, which
 * the job card is already about.
 */
function SoldOut({ t, overview, openSheet }: {
  t: T; overview?: StockOverview; openSheet: (s: SheetReq) => void;
}) {
  const { lang } = useI18n();
  const { autoHide } = useAutoHide();
  const rows = overview?.soldOut ?? [];
  if (rows.length === 0) return null;

  const nameOf = (r: (typeof rows)[number]) => (r.nameEn || r.nameAr
    ? pick({ nameEn: r.nameEn ?? '', nameAr: r.nameAr ?? '' }, 'name', lang)
    : `#${r.menuItemId}`);

  return (
    <section className="stk-off" role="status">
      <h3>{fill(t(autoHide ? 'offTitle' : 'offTitleWarn'), { n: rows.length })}</h3>
      <p className="stk-off-sub">
        {t(autoHide ? 'offSub' : 'offSubWarnOnly')}
        {autoHide && (
          <button className="stk-off-why-link" onClick={revealRule}>{t('changeRule')}</button>
        )}
      </p>
      <ul className="stk-off-list">
        {rows.map((r) => (
          <li key={r.menuItemId}>
            <span className="stk-off-name">{nameOf(r)}</span>
            {r.reason === 'DAILY_LIMIT_REACHED' ? (
              <span className="stk-off-why">{t('offLimit')}</span>
            ) : r.blockerId ? (
              /* The ingredient is the fix, so it is the control: tapping opens the thing you
                 have to buy rather than the drink you cannot sell. */
              <button className="stk-off-why link"
                onClick={() => openSheet({ k: 'item', id: r.blockerId! })}>
                {fill(t('offOut'), {
                  name: pick({ nameEn: r.blockerNameEn ?? '', nameAr: r.blockerNameAr ?? '' }, 'name', lang),
                })}
              </button>
            ) : (
              <span className="stk-off-why">{t('offOutPlain')}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The café's own switch over the one thing stock does without being asked. A standing rule
 * reads as a footnote to the thing it governs, so that is where it goes.
 */
function AutoHideRule({ t, hidden }: { t: T; hidden: number }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { restaurantId: rid, restaurant, autoHide } = useAutoHide();
  const setAutoHide = useMutation({
    mutationFn: (on: boolean) => api.patch(`/api/restaurants/${rid}`, { autoHideOutOfStock: on }),
    onSuccess: (_d, on) => {
      qc.invalidateQueries({ queryKey: ['restaurant', rid] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      toast(on ? t('autoHideOn') : t('autoHideOff'));
    },
    onError: (e: Error) => toast(e.message),
  });
  if (!restaurant) return null;

  return (
    <label className="stk-rule" id={RULE_ID}>
      <input type="checkbox" checked={autoHide} disabled={setAutoHide.isPending}
        onChange={(e) => setAutoHide.mutate(e.target.checked)} />
      <span>
        <b>{t('autoHideLabel')}</b>
        <em>{autoHide ? t('autoHideHintOn') : t('autoHideHintOff')}</em>
        {/* What the rule has actually done. A standing setting that never reports its own
            effect is one nobody connects to the drink that vanished. */}
        {autoHide && (
          <i className="stk-rule-now" data-live={hidden > 0 || undefined}>
            {hidden > 0 ? fill(t('hiddenNow'), { n: hidden }) : t('hiddenNone')}
          </i>
        )}
      </span>
    </label>
  );
}
