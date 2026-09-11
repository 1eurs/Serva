import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { useI18n, useT, pick } from '../../../lib/i18n';
import { Money } from '../../../lib/Money';
import type { MenuStockRule, RecipeLineRow, StockItemRow, StockUnit } from '../../../lib/types';
import { DICT } from './copy';
import { recipeUnitsFor, unitFactor, unitWord } from './units';
import './stock.css';

/**
 * What the sheet holds about a menu item while it is open: the rule and the recipe, as typed.
 * Null means "never loaded" — and a save is refused until it has, so a sheet that opened while
 * the network was down can never wipe a rule by re-sending an empty one.
 */
export type StockDraft = {
  stockItemId: number | null;
  dailyLimit: string;
  lines: { stockItemId: number | null; quantity: string; unit: StockUnit }[];
};

export const emptyDraft = (): StockDraft => ({ stockItemId: null, dailyLimit: '', lines: [] });

/**
 * Persist the draft after the menu item itself has been saved. Two PUTs, each a whole
 * replacement, so what is on the server is exactly what was on screen — no PATCH ambiguity
 * about whether an empty field meant "clear it" or "leave it".
 */
export async function saveStockDraft(branchId: number, menuItemId: number, d: StockDraft): Promise<void> {
  const limit = Number(d.dailyLimit);
  await api.put(`/api/branches/${branchId}/menu-stock/${menuItemId}`, {
    stockItemId: d.stockItemId,
    dailyLimit: Number.isInteger(limit) && limit > 0 ? limit : null,
  });
  const lines = d.lines
    .filter((l) => l.stockItemId != null && Number(l.quantity) > 0)
    .map((l) => ({ stockItemId: l.stockItemId, quantity: Number(l.quantity), unit: l.unit }));
  await api.put(`/api/branches/${branchId}/recipes/${menuItemId}`, { lines });
}

/**
 * The three questions the shelf asks about a menu item, each optional: is this item one of the
 * tins (one sale takes one), is there a cap on it today, and what goes into making it. The
 * first two change what a customer can buy; the third never does — it only lets the wall say
 * where the beans went.
 *
 * <p>Owned by whoever opens it: this component renders and edits the draft its owner holds, and
 * loads the current answers into it once for an existing item. It saves nothing itself.
 */
export function StockRules({ branchId, menuItemId, draft, onChange }: {
  branchId: number;
  /** Null while the item is new — nothing to load, the draft starts empty. */
  menuItemId: number | null;
  draft: StockDraft | null;
  onChange: (d: StockDraft) => void;
}) {
  const t = useT(DICT);
  const { lang } = useI18n();

  const shelfQ = useQuery({
    queryKey: ['stock', branchId],
    queryFn: () => api.get<StockItemRow[]>(`/api/branches/${branchId}/stock`),
  });
  const rulesQ = useQuery({
    queryKey: ['menu-stock', branchId],
    queryFn: () => api.get<MenuStockRule[]>(`/api/branches/${branchId}/menu-stock`),
    enabled: menuItemId != null,
  });
  const recipesQ = useQuery({
    queryKey: ['recipes', branchId],
    queryFn: () => api.get<RecipeLineRow[]>(`/api/branches/${branchId}/recipes`),
    enabled: menuItemId != null,
  });

  /* Load the current answers into the draft exactly once. A new item starts empty at once; an
     existing one waits for both reads so a half-loaded draft can never be saved over the
     server's whole one. */
  const loaded = menuItemId == null || (rulesQ.data != null && recipesQ.data != null);
  useEffect(() => {
    if (draft != null || !loaded) return;
    if (menuItemId == null) { onChange(emptyDraft()); return; }
    const rule = rulesQ.data!.find((r) => r.menuItemId === menuItemId);
    const lines = recipesQ.data!.filter((l) => l.menuItemId === menuItemId);
    onChange({
      stockItemId: rule?.stockItemId ?? null,
      dailyLimit: rule?.dailyLimit != null ? String(rule.dailyLimit) : '',
      lines: lines.map((l) => ({ stockItemId: l.stockItemId, quantity: String(l.quantity), unit: l.unit })),
    });
  }, [draft, loaded, menuItemId, rulesQ.data, recipesQ.data, onChange]);

  const shelf = shelfQ.data ?? [];
  const byId = useMemo(() => new Map(shelf.map((s) => [s.id, s])), [shelf]);
  const name = (s: StockItemRow) => pick(s, 'name', lang);

  /* What one of these costs to make, from the recipe and the prices on the shelf. Only shown
     when every ingredient has a price — a partial sum is a number that looks like an answer. */
  const plateCost = useMemo(() => {
    if (!draft || draft.lines.length === 0) return null;
    let sum = 0;
    for (const l of draft.lines) {
      const tin = l.stockItemId != null ? byId.get(l.stockItemId) : undefined;
      const f = tin ? unitFactor(l.unit, tin) : null;
      if (!tin || tin.unitPrice == null || f == null || !(Number(l.quantity) > 0)) return null;
      sum += Number(l.quantity) * f * Number(tin.unitPrice);
    }
    return sum;
  }, [draft, byId]);

  if (!draft) return <div className="stk-rules"><p className="stk-hint">{t('rulesLoading')}</p></div>;

  const set = (patch: Partial<StockDraft>) => onChange({ ...draft, ...patch });
  const setLine = (i: number, patch: Partial<StockDraft['lines'][number]>) =>
    set({ lines: draft.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  return (
    <div className="stk-rules">
      {shelf.length === 0 ? (
        <p className="stk-hint">{t('rulesNoShelf')}</p>
      ) : (
        <>
          <label className="stk-f">
            <span>{t('backedBy')}</span>
            <span className="stk-in">
              <select className="stk-select" value={draft.stockItemId ?? ''}
                onChange={(e) => set({ stockItemId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">{t('backedNone')}</option>
                {shelf.map((s) => <option key={s.id} value={s.id}>{name(s)}</option>)}
              </select>
            </span>
            {draft.stockItemId != null && <em className="stk-hint">{t('backedHint')}</em>}
          </label>

          <label className="stk-f">
            <span>{t('limitL')}</span>
            <span className="stk-in">
              <input className="num" type="number" inputMode="numeric" min="1" step="1" dir="ltr"
                value={draft.dailyLimit} onChange={(e) => set({ dailyLimit: e.target.value })} />
              <em>{t('perDay')}</em>
            </span>
            <em className="stk-hint">{t('limitHint')}</em>
          </label>

          <div className="stk-f">
            <span>{t('recipeT')}</span>
            <em className="stk-hint">{t('recipeHint')}</em>
            {draft.lines.map((l, i) => {
              const tin = l.stockItemId != null ? byId.get(l.stockItemId) : undefined;
              const units = tin ? recipeUnitsFor(tin) : [];
              return (
                <div className="stk-line" key={i}>
                  <select className="stk-select" value={l.stockItemId ?? ''}
                    onChange={(e) => {
                      const id = e.target.value ? Number(e.target.value) : null;
                      const next = id != null ? byId.get(id) : undefined;
                      /* The unit follows the tin: a recipe against kilos is spoken in grams. */
                      setLine(i, { stockItemId: id, unit: next ? recipeUnitsFor(next)[0] : l.unit });
                    }}>
                    <option value="">{t('pickTin')}</option>
                    {shelf.map((s) => <option key={s.id} value={s.id}>{name(s)}</option>)}
                  </select>
                  <input className="num" type="number" inputMode="decimal" min="0" step="0.01" dir="ltr"
                    value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })}
                    aria-label={t('fHave')} />
                  <select className="stk-select stk-unit-pick" value={l.unit} disabled={!tin}
                    onChange={(e) => setLine(i, { unit: e.target.value as StockUnit })} aria-label={t('fUnit')}>
                    {(units.length ? units : [l.unit]).map((u) => <option key={u} value={u}>{unitWord(u, lang)}</option>)}
                  </select>
                  <button type="button" className="stk-x" aria-label={t('removeItem')}
                    onClick={() => set({ lines: draft.lines.filter((_, j) => j !== i) })}>✕</button>
                </div>
              );
            })}
            <button type="button" className="stk-link" onClick={() =>
              set({ lines: [...draft.lines, { stockItemId: null, quantity: '', unit: 'PIECE' }] })}>
              ＋ {t('addLine')}
            </button>
            {plateCost != null && (
              <p className="stk-lands">{t('plateCost')} <Money value={plateCost} /></p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
