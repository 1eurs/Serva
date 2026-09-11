import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { useI18n, useT, pick } from '../../../lib/i18n';
import { Money } from '../../../lib/Money';
import type { MenuItemOptionGroupRow, MenuStockRule, OptionRecipeLineRow, RecipeLineRow, StockItemRow, StockUnit } from '../../../lib/types';
import { DICT, fill } from './copy';
import { recipeUnitsFor, unitFactor, unitWord } from './units';
import './stock.css';

/**
 * What the sheet holds about a menu item while it is open: the recipe and the cap, as typed.
 * Null means "never loaded" — and a save is refused until it has, so a sheet that opened while
 * the network was down can never wipe a recipe by re-sending an empty one.
 */
export type DraftLine = { stockItemId: number | null; quantity: string; unit: StockUnit };
/** What one of the item's choices changes: stand in for a base tin, and/or add lines on top. */
export type DraftOption = {
  groupName: string; optionName: string;
  replaces: number | null; stockItemId: number | null;
  adds: DraftLine[];
};
export type StockDraft = {
  lines: DraftLine[];
  options: DraftOption[];
  dailyLimit: string;
};

export const emptyDraft = (): StockDraft => ({ lines: [], options: [], dailyLimit: '' });

/**
 * Persist the draft. Two PUTs, each a whole replacement, so what is on the server is exactly
 * what was on screen — no PATCH ambiguity about whether an empty field meant "clear it" or
 * "leave it".
 */
export async function saveStockDraft(branchId: number, menuItemId: number, d: StockDraft): Promise<void> {
  const lines = d.lines
    .filter((l) => l.stockItemId != null && Number(l.quantity) > 0)
    .map((l) => ({ stockItemId: l.stockItemId, quantity: Number(l.quantity), unit: l.unit }));
  const options = d.options.flatMap((o) => {
    const rows: object[] = [];
    if (o.replaces != null && o.stockItemId != null) {
      rows.push({ groupName: o.groupName, optionName: o.optionName, stockItemId: o.stockItemId, replacesStockItemId: o.replaces });
    }
    for (const a of o.adds) {
      if (a.stockItemId != null && Number(a.quantity) > 0) {
        rows.push({ groupName: o.groupName, optionName: o.optionName, stockItemId: a.stockItemId, quantity: Number(a.quantity), unit: a.unit });
      }
    }
    return rows;
  });
  await api.put(`/api/branches/${branchId}/recipes/${menuItemId}`, { lines, options });
  const limit = Number(d.dailyLimit);
  await api.put(`/api/branches/${branchId}/menu-stock/${menuItemId}`, {
    dailyLimit: Number.isInteger(limit) && limit > 0 ? limit : null,
  });
}

/**
 * The two things the shelf asks about a menu item, both optional: what it takes from the shelf
 * (a croissant takes one croissant; a latte takes 200 ml of milk and 18 g of beans — and
 * selling one draws exactly that), and whether there is a cap on it today.
 *
 * <p>Owned by whoever opens it: this component renders and edits the draft its owner holds, and
 * loads the current answers into it once. It saves nothing itself.
 */
export function StockRules({ branchId, menuItemId, optionGroups, draft, onChange }: {
  branchId: number;
  menuItemId: number;
  /** The item's own choices, as the menu defines them; each gets a row here. */
  optionGroups: MenuItemOptionGroupRow[];
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
  });
  const recipesQ = useQuery({
    queryKey: ['recipes', branchId],
    queryFn: () => api.get<RecipeLineRow[]>(`/api/branches/${branchId}/recipes`),
  });
  const optionsQ = useQuery({
    queryKey: ['recipe-options', branchId],
    queryFn: () => api.get<OptionRecipeLineRow[]>(`/api/branches/${branchId}/recipes/options`),
  });

  /* Load the current answers into the draft exactly once, and only when every read is in, so a
     half-loaded draft can never be saved over the server's whole one. Every choice the menu
     offers gets a row, rule or no rule, so the owner sees what is unanswered. */
  const loaded = rulesQ.data != null && recipesQ.data != null && optionsQ.data != null;
  useEffect(() => {
    if (draft != null || !loaded) return;
    const rule = rulesQ.data!.find((r) => r.menuItemId === menuItemId);
    const lines = recipesQ.data!.filter((l) => l.menuItemId === menuItemId);
    const rows = optionsQ.data!.filter((o) => o.menuItemId === menuItemId);
    const options: DraftOption[] = optionGroups.flatMap((g) => g.options.map((o) => {
      const mine = rows.filter((r) => r.groupName === g.nameEn && r.optionName === o.nameEn);
      const swap = mine.find((r) => r.replacesStockItemId != null);
      return {
        groupName: g.nameEn, optionName: o.nameEn,
        replaces: swap?.replacesStockItemId ?? null, stockItemId: swap?.stockItemId ?? null,
        adds: mine.filter((r) => r.replacesStockItemId == null)
          .map((r) => ({ stockItemId: r.stockItemId, quantity: String(r.quantity), unit: r.unit as StockUnit })),
      };
    }));
    onChange({
      lines: lines.map((l) => ({ stockItemId: l.stockItemId, quantity: String(l.quantity), unit: l.unit })),
      options,
      dailyLimit: rule?.dailyLimit != null ? String(rule.dailyLimit) : '',
    });
  }, [draft, loaded, menuItemId, optionGroups, rulesQ.data, recipesQ.data, optionsQ.data, onChange]);

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
  if (shelf.length === 0) return <div className="stk-rules"><p className="stk-hint">{t('rulesNoShelf')}</p></div>;

  const set = (patch: Partial<StockDraft>) => onChange({ ...draft, ...patch });
  const setLine = (i: number, patch: Partial<DraftLine>) =>
    set({ lines: draft.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const setOption = (i: number, patch: Partial<DraftOption>) =>
    set({ options: draft.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) });
  const setAdd = (oi: number, ai: number, patch: Partial<DraftLine>) =>
    setOption(oi, { adds: draft.options[oi].adds.map((a, j) => (j === ai ? { ...a, ...patch } : a)) });

  /* The base recipe's tins — what a choice can stand in for. */
  const baseTins = draft.lines.map((l) => l.stockItemId).filter((id): id is number => id != null);

  /** One ingredient row: which tin, how much, in which unit, and a way to take it off. */
  const lineRow = (l: DraftLine, key: string, patch: (p: Partial<DraftLine>) => void, remove: () => void) => {
    const tin = l.stockItemId != null ? byId.get(l.stockItemId) : undefined;
    const units = tin ? recipeUnitsFor(tin) : [];
    return (
      <div className="stk-line" key={key}>
        <select className="stk-select" value={l.stockItemId ?? ''}
          onChange={(e) => {
            const id = e.target.value ? Number(e.target.value) : null;
            const next = id != null ? byId.get(id) : undefined;
            const unit = next ? recipeUnitsFor(next)[0] : l.unit;
            /* The unit follows the tin: a recipe against kilos is spoken in grams. And a whole
               thing — a croissant from the box — is almost always one, so it is filled in. */
            patch({ stockItemId: id, unit, quantity: l.quantity || (unit === 'PIECE' ? '1' : '') });
          }}>
          <option value="">{t('pickTin')}</option>
          {shelf.map((s) => <option key={s.id} value={s.id}>{name(s)}</option>)}
        </select>
        <input className="num" type="number" inputMode="decimal" min="0" step="0.01" dir="ltr"
          value={l.quantity} onChange={(e) => patch({ quantity: e.target.value })} aria-label={t('fHave')} />
        <select className="stk-select stk-unit-pick" value={l.unit} disabled={!tin}
          onChange={(e) => patch({ unit: e.target.value as StockUnit })} aria-label={t('fUnit')}>
          {(units.length ? units : [l.unit]).map((u) => <option key={u} value={u}>{unitWord(u, lang)}</option>)}
        </select>
        <button type="button" className="stk-x" aria-label={t('removeItem')} onClick={remove}>✕</button>
      </div>
    );
  };

  return (
    <div className="stk-rules">
      <div className="stk-f">
        <span>{t('recipeT')}</span>
        <em className="stk-hint">{t('recipeHint')}</em>
        {draft.lines.map((l, i) => lineRow(l, `b${i}`,
          (p) => setLine(i, p), () => set({ lines: draft.lines.filter((_, j) => j !== i) })))}
        <button type="button" className="stk-link" onClick={() =>
          set({ lines: [...draft.lines, { stockItemId: null, quantity: '', unit: 'PIECE' }] })}>
          ＋ {t('addLine')}
        </button>
        {plateCost != null && (
          <p className="stk-lands">{t('plateCost')} <Money value={plateCost} /></p>
        )}
      </div>

      {/* Every choice the menu offers, rule or no rule. "Almond Milk — instead of Milk, use
          Almond milk" is one row and two picks; a choice left blank changes nothing. */}
      {draft.options.length > 0 && (
        <div className="stk-f">
          <span>{t('optT')}</span>
          <em className="stk-hint">{t('optHint')}</em>
          {draft.options.map((o, oi) => (
            <div className="stk-opt" key={`${o.groupName}/${o.optionName}`}>
              <div className="stk-opt-row">
                <b className="stk-opt-name">{o.optionName}</b>
                <button type="button" className="stk-link" onClick={() =>
                  setOption(oi, { adds: [...o.adds, { stockItemId: null, quantity: '', unit: 'PIECE' }] })}>
                  ＋ {t('addsLink')}
                </button>
                <div className="stk-opt-swap">
                  <span className="stk-opt-word">{t('insteadOf')}</span>
                  <select className="stk-select" value={o.replaces ?? ''} disabled={baseTins.length === 0}
                    onChange={(e) => setOption(oi, { replaces: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">{t('optNone')}</option>
                    {baseTins.map((id) => <option key={id} value={id}>{byId.get(id) ? name(byId.get(id)!) : id}</option>)}
                  </select>
                  {o.replaces != null && <>
                    <span className="stk-opt-word">{t('useTin')}</span>
                    <select className="stk-select" value={o.stockItemId ?? ''}
                      onChange={(e) => setOption(oi, { stockItemId: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">{t('pickTin')}</option>
                      {shelf.map((s) => <option key={s.id} value={s.id}>{name(s)}</option>)}
                    </select>
                  </>}
                </div>
              </div>
              {o.adds.map((a, ai) => lineRow(a, `o${oi}a${ai}`,
                (p) => setAdd(oi, ai, p), () => setOption(oi, { adds: o.adds.filter((_, j) => j !== ai) })))}
            </div>
          ))}
        </div>
      )}

      <label className="stk-f">
        <span>{t('limitL')}</span>
        <span className="stk-in">
          <input className="num" type="number" inputMode="numeric" min="1" step="1" dir="ltr"
            value={draft.dailyLimit} onChange={(e) => set({ dailyLimit: e.target.value })} />
          <em>{t('perDay')}</em>
        </span>
        <em className="stk-hint">{t('limitHint')}</em>
      </label>
    </div>
  );
}
