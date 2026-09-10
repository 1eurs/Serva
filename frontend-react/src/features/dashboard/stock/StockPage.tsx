import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useI18n, useT, pick, ltrText } from '../../../lib/i18n';
import { useToast } from '../../../lib/toast';
import { Money } from '../../../lib/Money';
import type {
  CoverRow, MenuLinkRow, ReorderSuggestion,
  Restaurant, StockItemRow, StockOverview,
} from '../../../lib/types';
import { DICT } from './copy';
import { agoWords } from './parts';
import { aisleLabel } from './aisles';
import { fill, levelOf, packLabel, qty, unitTag } from './units';
import Wall from './Wall';
import AddSheet from './AddSheet';
import FirstRun from './FirstRun';
import ItemSheet from './ItemSheet';
import ItemForm from './ItemForm';
import CountFlow from './CountFlow';
import { RecountSheet, WasteSheet } from './LogSheets';
import Uses from './Uses';
import './stock.css';

type T = (k: string) => string;

/**
 * Every sheet on the feature is opened from one place, so any screen can open any of them.
 */
export type SheetReq =
  | { k: 'add'; id: number }
  | { k: 'waste'; itemId?: number }
  | { k: 'recount'; id: number }
  | { k: 'edit'; id: number | null; name?: string }
  | { k: 'item'; id: number }
  | { k: 'uses' }
  | { k: 'count' };

/**
 * Stock — a shelf you look at.
 *
 * <p>Two rebuilds have now been aimed at the same complaint, and the second one was aimed at
 * the wrong question. It answered "what do I do now?" with a job card, a receipts line, a
 * consequence card and a list drawn against an axis — six instruments stacked above the
 * first quantity on the page. Owners were not asking what to do. They were asking
 * <em>what's on the shelf</em>, which is a looking question, and the page answered it last.
 *
 * <p>So the shelf is the page. There are three things on it and nothing else:
 *
 * <ol>
 *   <li><b>A search box.</b> The one control. Typing narrows the wall; typing something the
 *       café does not stock offers to add it, because that is what "it isn't here" means.</li>
 *   <li><b>One line of standing.</b> What needs buying, when the shelf was last counted, and
 *       what it is worth. Each is a tap into the thing that acts on it, so nothing was lost
 *       when the cards went — it just stopped competing with the shelf for the top of the
 *       screen.</li>
 *   <li><b>The wall.</b> Everything the café owns, all at once, every tile filled to its own
 *       level and one dashed order line crossing all of them at the same height.</li>
 * </ol>
 *
 * <p>Everything else — the count, what the menu draws on, the standing rule about hiding
 * sold-out drinks — is still here and still reachable, one tap deep, from the line that
 * mentions it.
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
  const [q, setQ] = useState('');
  /* The only filter on the page, and it is not a control of its own — it is what tapping the
     "to buy" figure does. A chip rail with three shades of worry is what the last build was
     trying to stop being. */
  const [onlyBuy, setOnlyBuy] = useState(false);

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
     single most useful thing a tile can say — "2 days" beats "820 g" for deciding anything. */
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

  const items = itemsQ.data ?? [];
  const overview = overviewQ.data;
  const suggestions = suggestQ.data ?? [];
  const links = linksQ.data ?? [];
  const cover = useMemo(
    () => new Map((coverQ.data ?? []).map((c) => [c.stockItemId, c])),
    [coverQ.data],
  );

  /* Deliberately capped or wired up — either way, not outstanding work. An owner who has
     finished every recipe they wanted should not be told for ever that one is missing. */
  const settled = links.filter((l) => l.stockMode === 'DAILY_LIMIT' || l.takes.length > 0).length;

  const belowLine = useMemo(
    () => items.filter((i) => { const l = levelOf(i); return l === 'out' || l === 'order'; }),
    [items],
  );

  /* One filter and one search, applied in that order, because "show me what to buy" is a
     question about the shelf and "milk" is a question about a tile. */
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((i) => {
      if (onlyBuy) { const l = levelOf(i); if (l !== 'out' && l !== 'order') return false; }
      if (!needle) return true;
      return `${i.nameEn} ${i.nameAr} ${aisleLabel(i.category, lang)}`.toLowerCase().includes(needle);
    });
  }, [items, q, onlyBuy, lang]);

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
          <div className="stk-hunt">
            <input className="stk-q" type="search" value={q} placeholder={t('search')}
              aria-label={t('search')} onChange={(e) => setQ(e.target.value)} />
            <button className="stk-add" onClick={() => openSheet({ k: 'edit', id: null })}>
              <span aria-hidden>+</span><em>{t('addItem')}</em>
            </button>
          </div>

          <Standing t={t} overview={overview} below={belowLine.length}
            onlyBuy={onlyBuy} onToggleBuy={() => setOnlyBuy(!onlyBuy)}
            openSheet={openSheet} />

          {onlyBuy && belowLine.length > 0 && (
            <OrderStrip t={t} suggestions={suggestions} items={items}
              branchId={scope} queryKey={key} />
          )}

          <SoldOut t={t} overview={overview} openSheet={openSheet} />

          {/* The sentence the product owed an owner and never said: sales are not moving
              these numbers, so nothing here will change on its own. Shown only when it is
              flatly true of the whole menu. */}
          {links.length > 0 && settled === 0 && (
            <button className="stk-note dead" onClick={() => openSheet({ k: 'uses' })}>
              <b>{t('loopDead')}</b>
              <span>{fill(t('loopDeadSub'), { n: links.length - settled, total: links.length })}</span>
              <em>{t('loopFix')} →</em>
            </button>
          )}

          <Wall t={t} items={shown} cover={cover} q={q}
            onOpen={(id) => openSheet({ k: 'add', id })}
            onNew={(name) => openSheet({ k: 'edit', id: null, name })} />

          {shown.length > 0 && (q.trim() || onlyBuy) && (
            <button className="stk-mini stk-clear"
              onClick={() => { setQ(''); setOnlyBuy(false); }}>{t('showAll')}</button>
          )}

          <AutoHideRule t={t} hidden={(overview?.soldOut ?? []).length} />
        </>
      )}

      {sheet?.k === 'add' && byId(sheet.id) && (
        <AddSheet t={t} branchId={scope} queryKey={key} item={byId(sheet.id)!}
          onClose={() => setSheet(null)}
          onRecount={() => setSheet({ k: 'recount', id: sheet.id })}
          onMore={() => setSheet({ k: 'item', id: sheet.id })} />
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
        <ItemForm t={t} branchId={scope} queryKey={key} initialName={sheet.name}
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
          onSeeOrder={() => { closeCount(); setOnlyBuy(true); }} />
      )}
    </div>
  );
}

/* ================================================================== standing */

/**
 * Where the café stands, in one line.
 *
 * <p>This is what is left of four cards, and nothing in it is new: what to buy, when the
 * shelf was last counted, what it is worth. Two of the three are taps into the screen that
 * changes them, so the cards were not deleted so much as folded back into the sentence that
 * was their headline.
 *
 * <p>The date on the count is load-bearing. Owners said they did not believe the figures,
 * and a figure printed with no date beside it is one nobody can check.
 */
function Standing({ t, overview, below, onlyBuy, onToggleBuy, openSheet }: {
  t: T; overview?: StockOverview; below: number;
  onlyBuy: boolean; onToggleBuy: () => void; openSheet: (s: SheetReq) => void;
}) {
  const { lang } = useI18n();
  const lastCount = overview?.readiness?.lastCountAt ?? null;

  return (
    <div className="stk-standing">
      {below > 0 ? (
        <button className="stk-stat as-buy" aria-pressed={onlyBuy} onClick={onToggleBuy}>
          <b className="num">{below}</b>{t('toBuy')}
        </button>
      ) : (
        <span className="stk-stat as-fact ok">{t('nothingToBuy')}</span>
      )}

      <button className="stk-stat" onClick={() => openSheet({ k: 'count' })}>
        {lastCount
          ? fill(t('counted'), { when: agoWords(lastCount, t, lang) ?? '—' })
          : t('countedNever')}
      </button>

      {overview && overview.inventoryValue > 0 && (
        <span className="stk-stat as-fact">
          <Money value={overview.inventoryValue} />{' '}{t('onShelves')}
        </span>
      )}
    </div>
  );
}

/* ================================================================== the order */

/**
 * The payoff, shown where it is asked for.
 *
 * <p>Copying the list into WhatsApp <em>is</em> placing the order — there is no second screen
 * where an owner would go and say so, and asking for that tap is the bookkeeping this feature
 * exists to avoid. So the same action records it, which is what lets the shelf stop asking
 * for beans that are already on the van.
 */
function OrderStrip({ t, suggestions, items, branchId, queryKey }: {
  t: T; suggestions: ReorderSuggestion[]; items: StockItemRow[];
  branchId?: number; queryKey: unknown[];
}) {
  const { lang } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();

  const send = useMutation({
    mutationFn: () => api.post(
      `/api/dashboard/stock/purchase-orders/from-suggestions?send=true${branchId ? `&branchId=${branchId}` : ''}`),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: (e: Error) => toast(e.message),
  });

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

  if (suggestions.length === 0) {
    /* Below the line but nothing to send: every one of them is already on a van. Saying so
       is the difference between a quiet page and a page that looks broken. */
    return <p className="stk-note">{t('allOnWay')}</p>;
  }

  return (
    <div className="stk-order-strip">
      <button className="key" onClick={copy} disabled={send.isPending}>{t('jobOrderGo')}</button>
      <span>
        {fill(t('orderCount'), { n: suggestions.length })}
        {estimate > 0 && <> · <Money value={estimate} /></>}
      </span>
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
 * right now — so it stays above the wall. It is one line until it is opened, because the
 * headline is the whole alarm and the list is the detail you want only once you have
 * decided to act on it.
 */
function SoldOut({ t, overview, openSheet }: {
  t: T; overview?: StockOverview; openSheet: (s: SheetReq) => void;
}) {
  const { lang } = useI18n();
  const { autoHide } = useAutoHide();
  const [open, setOpen] = useState(false);
  const rows = overview?.soldOut ?? [];
  if (rows.length === 0) return null;

  const nameOf = (r: (typeof rows)[number]) => (r.nameEn || r.nameAr
    ? pick({ nameEn: r.nameEn ?? '', nameAr: r.nameAr ?? '' }, 'name', lang)
    : `#${r.menuItemId}`);

  return (
    <section className="stk-off" role="status">
      <button className="stk-off-hd" aria-expanded={open} onClick={() => setOpen(!open)}>
        <b>{fill(t(autoHide ? 'offTitle' : 'offTitleWarn'), { n: rows.length })}</b>
        <i aria-hidden>{open ? '▴' : '▾'}</i>
      </button>

      {open && (
        <>
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
                  /* The ingredient is the fix, so it is the control: tapping opens the thing
                     you have to buy rather than the drink you cannot sell. */
                  <button className="stk-off-why link"
                    onClick={() => openSheet({ k: 'add', id: r.blockerId! })}>
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
        </>
      )}
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
