import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useI18n, pick } from '../../../lib/i18n';
import { useToast } from '../../../lib/toast';
import type { CategoryResponse, MenuItemResponse, MenuStockRule, RecipeLineRow, StockItemRow } from '../../../lib/types';
import { fill } from './copy';
import { Sheet } from './sheets';
import { StockRules, saveStockDraft, type StockDraft } from './StockRules';
import { qty, unitWord } from './units';

type T = (k: string) => string;

/**
 * The menu, seen from the shelf.
 *
 * <p>Everything about how a menu item meets the stock is set up here and nowhere else: what
 * backs it, how many a day, what goes into it. The owner never leaves the stock tab. Each item
 * is one line saying what has been decided about it, and a tap opens the three questions.
 *
 * <p>Grouped by category in menu order, because that is how an owner knows their own menu, and
 * the job here is to walk down it once.
 */
export default function MenuRules({ t, branchId, shelf }: {
  t: T; branchId: number; shelf: StockItemRow[];
}) {
  const { lang } = useI18n();
  const { user } = useAuth();
  const rid = user!.restaurantId!;
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const [draft, setDraft] = useState<StockDraft | null>(null);

  const catsQ = useQuery({
    queryKey: ['menu-cats', rid],
    queryFn: () => api.get<CategoryResponse[]>(`/api/menu/categories?restaurantId=${rid}`),
  });
  const itemsQ = useQuery({
    queryKey: ['menu-items', rid],
    queryFn: () => api.get<MenuItemResponse[]>(`/api/menu/items?restaurantId=${rid}`),
  });
  const rulesQ = useQuery({
    queryKey: ['menu-stock', branchId],
    queryFn: () => api.get<MenuStockRule[]>(`/api/branches/${branchId}/menu-stock`),
  });
  const recipesQ = useQuery({
    queryKey: ['recipes', branchId],
    queryFn: () => api.get<RecipeLineRow[]>(`/api/branches/${branchId}/recipes`),
  });

  const tins = useMemo(() => new Map(shelf.map((s) => [s.id, s])), [shelf]);
  const rules = useMemo(() => new Map((rulesQ.data ?? []).map((r) => [r.menuItemId, r])), [rulesQ.data]);
  const recipes = useMemo(() => {
    const m = new Map<number, RecipeLineRow[]>();
    for (const l of recipesQ.data ?? []) m.set(l.menuItemId, [...(m.get(l.menuItemId) ?? []), l]);
    return m;
  }, [recipesQ.data]);

  /* Items sold at this branch: restaurant-wide ones and this branch's own. Another branch's
     pinned items are not this branch's business. */
  const needle = q.trim().toLowerCase();
  const items = (itemsQ.data ?? [])
    .filter((i) => i.branchId == null || i.branchId === branchId)
    .filter((i) => !needle || `${i.nameEn ?? ''} ${i.nameAr ?? ''}`.toLowerCase().includes(needle));
  const cats = (catsQ.data ?? []).slice().sort((a, b) => a.displayOrder - b.displayOrder);
  const byCat = new Map<number, MenuItemResponse[]>();
  for (const i of items) byCat.set(i.categoryId, [...(byCat.get(i.categoryId) ?? []), i]);

  /** One line saying what has been decided — or, plainly, that nothing has. */
  const summary = (i: MenuItemResponse): { text: string; set: boolean } => {
    const parts: string[] = [];
    const rule = rules.get(i.id);
    const tin = rule?.stockItemId != null ? tins.get(rule.stockItemId) : undefined;
    if (tin) parts.push(fill(t('perSale'), { name: pick(tin, 'name', lang) }));
    if (rule?.dailyLimit != null) parts.push(fill(t('aDay'), { n: rule.dailyLimit }));
    const lines = recipes.get(i.id) ?? [];
    if (lines.length) {
      const shown = lines.slice(0, 3).map((l) => {
        const tn = tins.get(l.stockItemId);
        return tn ? `${pick(tn, 'name', lang)} ${qty(l.quantity, l.unit)} ${unitWord(l.unit, lang)}` : '';
      }).filter(Boolean);
      parts.push(shown.join(', ') + (lines.length > 3 ? ` +${lines.length - 3}` : ''));
    }
    return parts.length ? { text: parts.join(' · '), set: true } : { text: t('notSetUp'), set: false };
  };

  const open = openId != null ? (itemsQ.data ?? []).find((i) => i.id === openId) ?? null : null;
  const close = () => { setOpenId(null); setDraft(null); };

  const save = useMutation({
    mutationFn: () => saveStockDraft(branchId, openId!, draft!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['menu-stock', branchId] });
      qc.invalidateQueries({ queryKey: ['recipes', branchId] });
      qc.invalidateQueries({ queryKey: ['stock-usage', branchId] });
      qc.invalidateQueries({ queryKey: ['pad-menu'] });
      toast(t('savedToast'));
      close();
    },
    onError: (e: Error) => toast(e.message),
  });

  const loading = catsQ.isLoading || itemsQ.isLoading || rulesQ.isLoading || recipesQ.isLoading;

  return (
    <div className="stk-menu">
      <p className="stk-menu-hint">{t('menuHint')}</p>
      <input className="stk-search" type="search" value={q} placeholder={t('search')}
        onChange={(e) => setQ(e.target.value)} aria-label={t('search')} />

      {loading ? (
        <p className="stk-msg">{t('loading')}</p>
      ) : items.length === 0 ? (
        <div className="stk-none"><b>{needle ? fill(t('noMatchT'), { q: q.trim() }) : t('noMenu')}</b></div>
      ) : (
        cats.filter((c) => byCat.has(c.id)).map((c) => (
          <section className="stk-cat" key={c.id}>
            <h3>{pick(c, 'name', lang)}</h3>
            <div className="stk-mi-list">
              {byCat.get(c.id)!.map((i) => {
                const s = summary(i);
                return (
                  <button key={i.id} className="stk-mi" onClick={() => { setDraft(null); setOpenId(i.id); }}>
                    <span className="stk-mi-name">{pick(i, 'name', lang)}</span>
                    <span className={`stk-mi-sum${s.set ? '' : ' unset'}`}>{s.text}</span>
                    <span className="stk-mi-go" aria-hidden>›</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}

      {open && (
        <Sheet title={pick(open, 'name', lang)} onClose={close}
          onSubmit={() => save.mutate()} submitLabel={t('save')}
          busy={save.isPending} problem={draft ? null : t('rulesLoading')}>
          <StockRules branchId={branchId} menuItemId={open.id} draft={draft} onChange={setDraft} />
        </Sheet>
      )}
    </div>
  );
}
