import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useI18n, useT, pick } from '../../../lib/i18n';
import { Money } from '../../../lib/Money';
import type { MenuItemResponse, MenuLinkRow, MenuTake, StockItemRow } from '../../../lib/types';
import { DICT } from './copy';
import { Sheet } from './parts';
import { fill, qty, unitTag } from './units';
import RecipeEditor from './RecipeEditor';

type T = (k: string) => string;

/**
 * The other half of stock: what a sale takes off the shelf.
 *
 * <p>This used to be a tab sitting beside the shelf, called "What sales take", with a small
 * exclamation mark on it. Owners did not open it. They entered twenty ingredients, watched
 * every figure sit perfectly still, and reported that stock was broken — which, without this
 * half, it was.
 *
 * <p>So it is no longer somewhere to go. It is asked while an item is being added, named as a
 * consequence on any item nothing draws on, and opened from the job card when it is the thing
 * standing between the café and an order list. This screen is where that lands: the whole
 * menu, worst first, each row a sentence about a connection.
 */
export default function Uses({ branchId, items, onClose }: {
  branchId?: number; items: StockItemRow[]; onClose: () => void;
}) {
  const t = useT(DICT);
  const { lang } = useI18n();
  const rid = useAuth().user!.restaurantId!;
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<MenuItemResponse | null>(null);

  const menuQ = useQuery({
    queryKey: ['menu-items', rid],
    queryFn: () => api.get<MenuItemResponse[]>(`/api/menu/items?restaurantId=${rid}`),
  });
  const linksQ = useQuery({
    queryKey: ['stock', branchId ?? 'me', 'menu-links'],
    queryFn: () => api.get<MenuLinkRow[]>(
      `/api/dashboard/stock/menu-links${branchId ? `?branchId=${branchId}` : ''}`),
  });

  const menu = menuQ.data ?? [];
  const links = useMemo(
    () => new Map((linksQ.data ?? []).map((l) => [l.menuItemId, l])),
    [linksQ.data],
  );

  /* Three states, not four. NONE and DAILY_LIMIT both draw nothing, but lumping them would
     hide a cap the owner set on purpose — and an item they capped has been dealt with. */
  const wiringOf = (l?: MenuLinkRow): 'none' | 'limit' | 'wired' =>
    (l && l.takes.length > 0 ? 'wired' : l?.stockMode === 'DAILY_LIMIT' ? 'limit' : 'none');

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return menu
      .filter((m) => !needle
        || (m.nameEn ?? '').toLowerCase().includes(needle)
        || (m.nameAr ?? '').includes(q.trim()))
      .map((m) => ({ item: m, link: links.get(m.id), wiring: wiringOf(links.get(m.id)) }))
      /* Unconnected first, and within that the best sellers: connecting the drink you sell
         eighty of a week is the one that makes the shelf visibly move by tomorrow. */
      .sort((a, b) => ({ none: 0, limit: 1, wired: 2 })[a.wiring] - ({ none: 0, limit: 1, wired: 2 })[b.wiring]
        || (b.link?.soldRecently ?? 0) - (a.link?.soldRecently ?? 0)
        || pick(a.item, 'name', lang).localeCompare(pick(b.item, 'name', lang)));
  }, [menu, links, q, lang]);

  const wired = menu.filter((m) => wiringOf(links.get(m.id)) === 'wired').length;
  const groups: { key: 'none' | 'limit' | 'wired'; label: string; alert?: boolean }[] = [
    { key: 'none', label: t('uNothing'), alert: true },
    { key: 'limit', label: t('uLimit') },
    { key: 'wired', label: t('uWired') },
  ];

  return (
    <Sheet title={t('uTitle')} onClose={onClose} wide>
      {menuQ.isLoading || linksQ.isLoading ? (
        <div className="center"><div className="spinner" /></div>
      ) : menu.length === 0 ? (
        <p className="stk-empty">{t('uNoMenu')}</p>
      ) : items.length === 0 ? (
        <p className="stk-empty">{t('uNoShelf')}</p>
      ) : (
        <>
          <p className="stk-uses-head">
            {wired === 0
              ? t('uHeadNone')
              : fill(t('uHead'), { wired, total: menu.length })}
          </p>

          <input className="stk-q" type="search" value={q} placeholder={t('uSearch')}
            aria-label={t('uSearch')} onChange={(e) => setQ(e.target.value)} />

          {rows.length === 0 ? <p className="stk-empty">{t('noMatch')}</p> : (
            <div className="stk-uses-list">
              {groups.map((g) => {
                const group = rows.filter((r) => r.wiring === g.key);
                if (!group.length) return null;
                return (
                  <section key={g.key}>
                    <h4 className={`stk-sec-hd${g.alert ? ' alert' : ''}`}>
                      <span className="stk-band-label">{g.label}<i className="num">{group.length}</i></span>
                    </h4>
                    {group.map(({ item, link }) => (
                      <UseRow key={item.id} t={t} item={item} link={link}
                        onOpen={() => setEditing(item)} />
                    ))}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      {editing && (
        <RecipeEditor item={editing} branchId={branchId} onClose={() => setEditing(null)} />
      )}
    </Sheet>
  );
}

/**
 * One menu item as a sentence about a connection.
 *
 * <p>The strip of ingredients carries the whole state — a real list of amounts, or a dashed
 * empty rule — so the list is legible before a word of it is read. The money on the right is
 * the payoff that gets the second recipe entered.
 */
function UseRow({ t, item, link, onOpen }: {
  t: T; item: MenuItemResponse; link?: MenuLinkRow; onOpen: () => void;
}) {
  const { lang } = useI18n();
  const takes = link?.takes ?? [];
  const uncounted = takes.filter((k) => k.neverCounted).length;
  return (
    <button className="stk-use" onClick={onOpen}>
      <span className="stk-use-top">
        <b>{pick(item, 'name', lang)}</b>
        {link && link.soldRecently > 0 && (
          <em className="num">{fill(t('uSold'), { n: link.soldRecently })}</em>
        )}
      </span>

      {takes.length > 0 ? (
        <span className="stk-use-takes">
          {takes.map((k) => <Ing key={k.stockItemId} t={t} take={k} />)}
        </span>
      ) : (
        <span className="stk-use-nil">
          <i aria-hidden />
          <em>{link?.stockMode === 'DAILY_LIMIT' ? t('uLimit') : t('uNil')}</em>
          <span className="stk-use-set">{t('uSet')} →</span>
        </span>
      )}

      <span className="stk-use-money">
        {link?.plateCost != null && link.plateCost > 0 && (
          <b className="num">{fill(t('uCost'), { v: '' })}<Money value={link.plateCost} /></b>
        )}
        {link?.foodCostPercent != null && (
          <i className="num">{fill(t('uPct'), { n: Math.round(link.foodCostPercent) })}</i>
        )}
        {uncounted > 0 && <i className="stk-use-warn">{t('uUncounted')}</i>}
      </span>
    </button>
  );
}

/** One ingredient in the strip: a mono amount and the thing it comes off. */
function Ing({ t, take }: { t: T; take: MenuTake }) {
  const { lang } = useI18n();
  return (
    <span className="stk-ing" data-uncounted={take.neverCounted || undefined}
      title={take.neverCounted ? t('uUncounted') : undefined}>
      <b className="num">{qty(take.quantityBase, take.baseUnit)}{unitTag(take.baseUnit, t)}</b>
      {pick(take, 'name', lang)}
    </span>
  );
}
