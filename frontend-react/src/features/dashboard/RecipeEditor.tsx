import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { useI18n, useT, pick, type Dict } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import { omr } from '../../lib/format';
import type {
  MenuItemResponse, RecipeLineRow, RecipeResponse, RecipeSavePayload,
  StockItemRow, StockMode,
} from '../../lib/types';
import './stock.css';
import NumField from './NumField';

const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), s);

/** Trailing zeros on a recipe amount are noise: 18.2 g, not 18.182 g. */
const qtyText = (n: number) => (Math.round(n * 10) / 10).toString();

const DICT: Dict = {
  ar: {
    title: 'المخزون والوصفة', close: 'إغلاق', save: 'حفظ',
    modeNone: 'بدون تتبع', modeNoneHint: 'لا يتأثر هذا الصنف بالمخزون.',
    modeLimit: 'حد يومي', modeLimitHint: '«١٢ قطعة فقط اليوم» — يُصفَّر تلقائياً كل صباح. بلا عدّ ولا وصفة.',
    modeSimple: 'يُشترى جاهزاً',
    modeSimpleHint: 'كرواسون، ماء معبأ. كل بيعة تنقص واحدة من رصيد بنفس هذا الاسم في صفحة المخزون.',
    openingCount: 'كم عندك منه الحين؟',
    openingHint: 'هذا الرصيد اللي ينقص مع كل بيعة. اتركه فاضي إذا بتعدّه بعدين — ما راح نرفض أي طلب قبل ما تعدّه.',
    openingUnit: 'حبة', openingNote: 'رصيد افتتاحي',
    modeRecipe: 'من المكوّنات', modeRecipeHint: 'للمشروبات: ١٨ جم بن + ٢٠٠ مل حليب + كوب.',
    goExact: 'بالكميات بالضبط', goTick: 'بالتأشير',
    tickHint: 'ما في مكوّنات بعد. أضف اللي يدخل في هذا الصنف — الكمية تجيك جاهزة وتقدر تعدّلها.',
    pieces: 'حبة', remove: 'شيل',
    pickAdd: 'أضف مكوّن', pickDone: 'خلصت', pickSearch: 'دوّر على مكوّن',
    pickAllIn: 'كل المكوّنات الجاهزة داخلة في هذا الصنف.', pickNoMatch: 'ما في مكوّن بهذا الاسم.',
    needYield: '{n} صنف ما عندها عدد حصص بعد — حدّده في صفحة المخزون عشان تقدر تأشّر عليها.',
    noYieldAtAll: 'ما في صنف مخزون عنده عدد حصص. افتح المخزون وقل كم حصة تطلع من العبوة.',
    dailyLimit: 'الحد اليومي', remainingToday: 'المتبقي اليوم',
    ingredients: 'المكوّنات', addLine: 'إضافة مكوّن', amount: 'الكمية', scope: 'يُطبَّق على',
    ALL: 'الكل', DINE_IN: 'داخلي', CAR: 'سيارة',
    optionExtras: 'إضافات الخيارات', optionHint: 'الخيارات تعمل على المخزون تماماً كما تعمل على السعر: فرق يُضاف للأساس. يمكن أن تكون الكمية سالبة.',
    cost: 'التكلفة', packagingCost: 'التغليف', price: 'السعر', foodCost: 'نسبة التكلفة', margin: 'الربح',
    allergens: 'مسببات الحساسية', noStockItems: 'أضف أصنافاً في صفحة المخزون أولاً.',
    saved: 'تم الحفظ', saveFirst: 'احفظ الصنف أولاً ثم افتح الوصفة.',
  },
  en: {
    title: 'Stock & recipe', close: 'Close', save: 'Save',
    modeNone: "Don't track", modeNoneHint: 'This item ignores stock entirely.',
    modeLimit: 'Daily limit', modeLimitHint: '"Only 12 today" — resets itself every morning. No counting, no recipe.',
    /* "Count these" pointed at nothing — you are editing one item, and the reader was
       left to guess what a sale took one off OF. The pair with "Made from ingredients"
       is the real question being asked: did you buy this finished, or build it? */
    modeSimple: 'Bought ready-made',
    modeSimpleHint: 'Croissants, bottled water. Each sale takes one off a count kept under this name on the Stock page.',
    openingCount: 'How many do you have right now?',
    openingHint: 'Sets the count this item sells down from. Leave it blank to count later — nothing is refused until you have.',
    openingUnit: 'in stock', openingNote: 'Opening count',
    modeRecipe: 'Made from ingredients', modeRecipeHint: 'For drinks: 18 g beans + 200 ml milk + a cup.',
    goExact: 'Exact amounts', goTick: 'Tick what is in it',
    tickHint: 'No ingredients yet. Add what goes into this — amounts arrive filled in and stay editable.',
    pieces: 'pcs', remove: 'Remove',
    pickAdd: 'Add ingredient', pickDone: 'Done', pickSearch: 'Search ingredients',
    pickAllIn: 'Everything with a serving count is already in this dish.', pickNoMatch: 'No ingredient by that name.',
    needYield: '{n} items have no serving count yet — set it on the Stock page to tick them here.',
    noYieldAtAll: 'No stock item has a serving count yet. Open Stock and say how many servings a pack makes.',
    dailyLimit: 'Max per day', remainingToday: 'Left today',
    ingredients: 'Ingredients', addLine: 'Add ingredient', amount: 'Amount', scope: 'Applies to',
    ALL: 'All orders', DINE_IN: 'Dine-in', CAR: 'Car',
    optionExtras: 'Option extras',
    optionHint: 'Options work on stock exactly the way they work on price: a delta on top of the base. Quantities may be negative — a Large that swaps the small cup out is −1 of it.',
    cost: 'Cost', packagingCost: 'Packaging', price: 'Price', foodCost: 'Food cost', margin: 'Margin',
    allergens: 'Allergens', noStockItems: 'Add some items on the Stock page first.',
    saved: 'Saved', saveFirst: 'Save the item first, then open its recipe.',
  },
};

const MODES: { m: StockMode; ic: string; key: string; hint: string }[] = [
  { m: 'NONE', ic: '○', key: 'modeNone', hint: 'modeNoneHint' },
  { m: 'DAILY_LIMIT', ic: '📅', key: 'modeLimit', hint: 'modeLimitHint' },
  { m: 'SIMPLE', ic: '🔢', key: 'modeSimple', hint: 'modeSimpleHint' },
  { m: 'RECIPE', ic: '🧾', key: 'modeRecipe', hint: 'modeRecipeHint' },
];

/**
 * A menu item's whole stock setup in one panel: which rung of the ladder it is on, what it is
 * made from, what each size option swaps, and what all of that costs.
 *
 * <p>The costing footer is the point. Typing "18 g beans" is a chore; watching the food-cost
 * percentage appear next to the price is the payoff that gets the second recipe entered.
 */
export default function RecipeEditor({ item, branchId, onClose }: {
  item: MenuItemResponse; branchId?: number | null; onClose: () => void;
}) {
  const t = useT(DICT);
  const { lang } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();

  /* Every other sheet in the feature closes on Escape; this one trapped you in it. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const recipeQ = useQuery({
    queryKey: ['recipe', item.id],
    queryFn: () => api.get<RecipeResponse>(`/api/dashboard/stock/menu-items/${item.id}/recipe`),
  });
  /* A recipe is restaurant-scoped — names, units, costs and yields are the same at every
     branch — but the items endpoint bundles per-branch levels into its response and so
     insists on a branch. Pass the one being viewed; a single-branch café resolves itself
     server-side, which is why this worked nowhere and looked like an empty ingredient list. */
  const stockQ = useQuery({
    queryKey: ['stock', branchId ?? 'me', 'items'],
    queryFn: () => api.get<StockItemRow[]>(
      `/api/dashboard/stock/items${branchId ? `?branchId=${branchId}` : ''}`),
  });
  const stockItems = stockQ.data ?? [];
  const recipe = recipeQ.data;

  const [mode, setMode] = useState<StockMode | null>(null);
  const [limit, setLimit] = useState<string | null>(null);
  const [lines, setLines] = useState<RecipeLineRow[] | null>(null);
  const [optLines, setOptLines] = useState<Record<number, RecipeLineRow[]> | null>(null);
  /* The opening count. Choosing "bought ready-made" used to create a countable good and
     leave it at zero without ever asking how many were on the shelf — so the first thing
     the feature did to a café was refuse to sell a croissant that was sitting in the case.
     Asked here because here is where the answer is known. Blank is a real answer: it means
     "not counted yet", which the server treats as unknown rather than as none. */
  const [opening, setOpening] = useState<string | null>(null);

  // Server state seeds the form once; after that the local edits win.
  const m = mode ?? recipe?.stockMode ?? 'NONE';
  const dailyLimit = limit ?? (recipe?.dailyLimit != null ? String(recipe.dailyLimit) : '');
  const recipeLines = lines ?? recipe?.lines ?? [];
  const optionLines = optLines ?? Object.fromEntries(
    (recipe?.optionRecipes ?? []).map((o) => [o.optionId, o.lines]),
  );
  /* What the backing good already holds, if this item has been on SIMPLE before. An item
     that has never been counted has no level row and reports nothing, so the field starts
     empty rather than at a zero the café never said. */
  const backingGood = recipe?.stockItemId != null
    ? stockItems.find((s) => s.id === recipe.stockItemId)
    : undefined;
  const countedOnHand = backingGood?.onHand;
  const openingCount = opening ?? (countedOnHand != null ? String(Math.round(countedOnHand)) : '');

  /* No longer editable here, but still echoed back on save. A café that mapped bundles
     before must not lose them because the screen that showed them went away. */
  const packagingRuleId = recipe?.packagingRuleId ?? null;
  const optionRules: Record<number, number | null> = Object.fromEntries(
    (recipe?.optionRecipes ?? []).map((o) => [o.optionId, o.packagingRuleId ?? null]),
  );

  const allOptions = useMemo(
    () => (item.optionGroups ?? []).flatMap((g) => (g.options ?? []).map((o) => ({ group: g, option: o }))),
    [item.optionGroups],
  );

  const unitOf = (stockItemId: number) => stockItems.find((s) => s.id === stockItemId)?.baseUnit ?? 'G';

  /**
   * Authoring by yield.
   *
   * A recipe line and a yield are the same fact from two ends: 18 g of beans per drink is
   * a kilo bag going 55 drinks. Typing the first is a chore nobody finishes; answering the
   * second takes one guess per ingredient, once, on the item itself. So ticking an item
   * writes an ordinary recipe line at purchaseUnitSize / servingsPerPack, and nothing
   * downstream — consumption, plate cost, allergens, availability — knows the difference.
   */
  const servingQty = (s: StockItemRow): number =>
    s.servingQuantityBase ?? (s.servingsPerPack && s.servingsPerPack > 0
      ? s.purchaseUnitSize / s.servingsPerPack : 0);

  const tickable = useMemo(
    () => stockItems.filter((s) => !s.archived && servingQty(s) > 0),
    [stockItems],
  );
  const noYield = useMemo(
    () => stockItems.filter((s) => !s.archived && servingQty(s) <= 0),
    [stockItems],
  );

  /* Open on whichever view can tell the whole truth about what is saved. Amounts are
     editable in the tick list now, so a hand-typed 120 ml shows as 120 ml there — the only
     recipes tick cannot represent are the ones it has no row for: the same item twice, a
     line scoped to dine-in only, or an ingredient with no yield. Those open in the exact
     editor, where nothing about them is hidden. */
  const seedAuthor = (): 'tick' | 'exact' => {
    const ls = recipe?.lines ?? [];
    if (ls.length === 0) return 'tick';
    const ids = ls.map((l) => l.stockItemId);
    const duplicate = new Set(ids).size !== ids.length;
    const scoped = ls.some((l) => (l.orderTypeScope ?? 'ALL') !== 'ALL');
    const untickable = ls.some((l) => {
      const s = stockItems.find((x) => x.id === l.stockItemId);
      return !s || servingQty(s) <= 0;
    });
    return duplicate || scoped || untickable ? 'exact' : 'tick';
  };
  const [authorMode, setAuthorMode] = useState<'tick' | 'exact' | null>(null);
  const author = authorMode ?? seedAuthor();
  const setAuthor = (a: 'tick' | 'exact') => setAuthorMode(a);

  /* Two lists, not one: what is in the dish, and what could be. Chosen keeps the order the
     lines were added in, so an ingredient never jumps around under the finger as you type. */
  const chosen = useMemo(
    () => recipeLines
      .map((l, idx) => ({ item: stockItems.find((s) => s.id === l.stockItemId), idx }))
      .filter((r): r is { item: StockItemRow; idx: number } => !!r.item),
    [recipeLines, stockItems],
  );
  const [picking, setPicking] = useState(false);
  const [pickQ, setPickQ] = useState('');
  const candidates = useMemo(
    () => tickable.filter((s) => !recipeLines.some((l) => l.stockItemId === s.id)),
    [tickable, recipeLines],
  );
  const shownCandidates = useMemo(() => {
    const needle = pickQ.trim().toLowerCase();
    const list = needle
      ? candidates.filter((s) => `${s.nameEn} ${s.nameAr} ${s.category ?? ''}`.toLowerCase().includes(needle))
      : candidates;
    /* Grouped the way the café already thinks about its stock, so "the milks" sit together. */
    return [...list].sort((a, b) =>
      (a.category?.trim() || '￿').localeCompare(b.category?.trim() || '￿')
      || pick(a, 'name', lang).localeCompare(pick(b, 'name', lang)));
  }, [candidates, pickQ, lang]);

  const toggleTick = (s: StockItemRow) => {
    const on = recipeLines.some((l) => l.stockItemId === s.id);
    setLines(on
      ? recipeLines.filter((l) => l.stockItemId !== s.id)
      /* One decimal on the way in: 1000 ÷ 55 is 18.181818, and a box showing that invites
         the owner to trust a precision the guess behind it never had. */
      : [...recipeLines, {
        stockItemId: s.id,
        quantityBase: Math.round(servingQty(s) * 10) / 10,
        orderTypeScope: 'ALL',
      }]);
  };

  /**
   * Live plate cost from the current form state, so the footer reacts as you type rather than
   * waiting for a save. Mirrors the server's rule: quantity inflated by the waste allowance,
   * times the running average cost.
   */
  const liveCost = useMemo(() => {
    let total = 0;
    for (const l of recipeLines) {
      const s = stockItems.find((x) => x.id === l.stockItemId);
      if (s) total += l.quantityBase * (1 + (s.wastePct || 0) / 100) * s.costPerBaseUnit;
    }
    return total;
  }, [recipeLines, stockItems]);

  /* Straight from the server now rather than recomputed from a rules list we no longer
     fetch — and it stays correct for any café that does have bundles mapped. */
  const packCost = recipe?.packagingCost ?? 0;
  const price = recipe?.price ?? item.price;
  const shownCost = m === 'RECIPE' ? liveCost : (recipe?.plateCost ?? 0);
  const foodCostPct = price > 0 && shownCost > 0 ? (shownCost / price) * 100 : null;
  const margin = price - shownCost - packCost;

  const save = useMutation({
    mutationFn: async () => {
      const payload: RecipeSavePayload = {
        stockMode: m,
        stockItemId: recipe?.stockItemId ?? null,
        dailyLimit: m === 'DAILY_LIMIT' ? Number(dailyLimit) || null : null,
        lines: m === 'RECIPE' ? recipeLines.filter((l) => l.stockItemId && l.quantityBase) : [],
        optionRecipes: allOptions
          .filter(({ option }) => (optionLines[option.id!]?.length ?? 0) > 0 || optionRules[option.id!] != null)
          .map(({ option }) => ({
            optionId: option.id!,
            lines: (optionLines[option.id!] ?? []).filter((l) => l.stockItemId && l.quantityBase),
            packagingRuleId: optionRules[option.id!] ?? null,
          })),
        packagingRuleId,
      };
      const saved = await api.put<RecipeResponse>(
        `/api/dashboard/stock/menu-items/${item.id}/recipe`, payload);

      /* Second call on purpose. The recipe endpoint owns the item's configuration; what is
         physically on the shelf is a movement in the ledger, and it has to be recorded as
         one so the correction is auditable like every other. Only when the number actually
         changed — re-saving an unrelated field must not write a no-op count. */
      const wanted = openingCount.trim();
      if (m === 'SIMPLE' && saved.stockItemId != null && wanted !== ''
          && Number(wanted) !== (countedOnHand ?? null)) {
        await api.post('/api/dashboard/stock/adjust', {
          branchId: branchId ?? undefined,
          stockItemId: saved.stockItemId,
          quantityBase: Number(wanted),
          note: t('openingNote'),
        });
      }
      return saved;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipe', item.id] });
      qc.invalidateQueries({ queryKey: ['menu'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      toast(t('saved'));
      onClose();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  const setLine = (idx: number, patch: Partial<RecipeLineRow>) =>
    setLines(recipeLines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const setOptLine = (optionId: number, idx: number, patch: Partial<RecipeLineRow>) =>
    setOptLines({
      ...optionLines,
      [optionId]: (optionLines[optionId] ?? []).map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    });

  return (
    <div className="modal-bg stk-modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card stk-sheet stock-page" role="dialog" aria-modal="true"
        aria-labelledby="recipe-title">
        <div className="stk-sheet-hd">
          <h3 id="recipe-title">{t('title')} · {pick(item, 'name', lang)}</h3>
          <button className="x" onClick={onClose} aria-label={t('close')}>✕</button>
        </div>

        <div className="stk-sheet-body">
          {stockItems.length === 0 && <p className="stk-hint">{t('noStockItems')}</p>}

          <div className="stk-modes">
            {MODES.map((x) => (
              <button key={x.m} type="button" className={`stk-mode ${m === x.m ? 'on' : ''}`}
                onClick={() => setMode(x.m)}>
                <span className="ic">{x.ic}</span>
                <span><b>{t(x.key)}</b><em>{t(x.hint)}</em></span>
              </button>
            ))}
          </div>

          {/* The only field this mode needs, and the whole reason it stopped being a
              trap: one number, asked once, in the place the owner is already standing. */}
          {m === 'SIMPLE' && (
            <div>
              <label className="stk-f">
                <span>{t('openingCount')}</span>
                <input type="number" inputMode="numeric" min="0" step="1" value={openingCount}
                  placeholder="—" onChange={(e) => setOpening(e.target.value)} />
              </label>
              <p className="stk-hint" style={{ marginBlockStart: 6 }}>{t('openingHint')}</p>
            </div>
          )}

          {m === 'DAILY_LIMIT' && (
            <div className="stk-grid">
              <label className="stk-f"><span>{t('dailyLimit')}</span>
                <input type="number" inputMode="numeric" min="1" value={dailyLimit}
                  onChange={(e) => setLimit(e.target.value)} /></label>
              {recipe?.remainingToday != null && (
                <label className="stk-f"><span>{t('remainingToday')}</span>
                  <input value={recipe.remainingToday} readOnly /></label>
              )}
            </div>
          )}

          {m === 'RECIPE' && (
            <>
              <div className="stk-sec-h stk-author">
                <h4>{t('ingredients')}</h4>
                {/* Not a mode switch — both paths write the same recipe_lines. Ticking is
                    just the fast way to write them, and "exact amounts" shows you what the
                    ticks produced, so the escape hatch is also the explanation. */}
                <button type="button" className="stk-author-swap"
                  onClick={() => setAuthor(author === 'tick' ? 'exact' : 'tick')}>
                  {author === 'tick' ? t('goExact') : t('goTick')}
                </button>
              </div>

              {author === 'tick' ? (
                <>
                  {/* What is in the drink, and nothing else. The catalogue is a tool for
                      adding to this list, not the list itself — a flat roll-call of every
                      item the café stocks put pistachio spread and napkins in front of
                      someone editing a cortado, and got longer with every delivery. */}
                  {chosen.length > 0 ? (
                    <div className="stk-ticks">
                      {chosen.map(({ item: s, idx }) => (
                        <IngredientRow key={s.id} s={s} lang={lang} t={t} amount={recipeLines[idx].quantityBase}
                          onAmount={(n) => setLine(idx, { quantityBase: n ?? 0 })}
                          onRemove={() => toggleTick(s)} />
                      ))}
                    </div>
                  ) : (
                    <p className="stk-hint">{t('tickHint')}</p>
                  )}

                  <button type="button" className="stk-tick-add" aria-expanded={picking}
                    onClick={() => setPicking(!picking)}>
                    {picking ? t('pickDone') : `+ ${t('pickAdd')}`}
                  </button>

                  {picking && (
                    <div className="stk-pick">
                      {/* Search earns its place only once the catalogue outgrows a glance. */}
                      {candidates.length > 8 && (
                        <input className="stk-pick-q" value={pickQ} placeholder={t('pickSearch')}
                          aria-label={t('pickSearch')} onChange={(e) => setPickQ(e.target.value)} />
                      )}
                      {shownCandidates.length === 0 ? (
                        <p className="stk-hint">{candidates.length === 0 ? t('pickAllIn') : t('pickNoMatch')}</p>
                      ) : (
                        <div className="stk-ticks">
                          {shownCandidates.map((s) => {
                            const unit = s.baseUnit === 'PIECE' ? t('pieces') : s.baseUnit.toLowerCase();
                            return (
                              <button key={s.id} type="button" className="stk-tick stk-tick-opt"
                                onClick={() => toggleTick(s)}>
                                <span className="stk-tick-box" aria-hidden>+</span>
                                <span className="stk-tick-name">{pick(s, 'name', lang)}</span>
                                <span className="stk-tick-ghost num">{qtyText(servingQty(s))} {unit}</span>
                                <span className="stk-tick-cost num">
                                  {s.servingCost ? omr(s.servingCost) : '—'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {/* Nothing here is broken — these items simply have not been asked how
                          far a pack goes, and the answer lives on the item, not on this dish. */}
                      {noYield.length > 0 && (
                        <p className="stk-hint">{fill(t('needYield'), { n: noYield.length })}</p>
                      )}
                      {tickable.length === 0 && <p className="stk-hint">{t('noYieldAtAll')}</p>}
                    </div>
                  )}
                </>
              ) : (
                <>
              {recipeLines.map((l, idx) => (
                <div className="stk-line" key={idx}>
                  <select value={l.stockItemId} onChange={(e) => setLine(idx, { stockItemId: Number(e.target.value) })}>
                    {stockItems.map((s) => <option key={s.id} value={s.id}>{pick(s, 'name', lang)}</option>)}
                  </select>
                  <label><span>{t('amount')} ({unitOf(l.stockItemId).toLowerCase()})</span>
                    <NumField step="0.1" value={l.quantityBase}
                      onValue={(n) => setLine(idx, { quantityBase: n ?? 0 })} /></label>
                  <label><span>{t('scope')}</span>
                    <select value={l.orderTypeScope ?? 'ALL'}
                      onChange={(e) => setLine(idx, { orderTypeScope: e.target.value as RecipeLineRow['orderTypeScope'] })}>
                      <option value="ALL">{t('ALL')}</option>
                      <option value="DINE_IN">{t('DINE_IN')}</option>
                      <option value="CAR">{t('CAR')}</option>
                    </select></label>
                  <button className="x" onClick={() => setLines(recipeLines.filter((_, i) => i !== idx))}
                    aria-label="remove">✕</button>
                </div>
              ))}
              <button className="btn sm ghost" disabled={stockItems.length === 0}
                onClick={() => setLines([...recipeLines, { stockItemId: stockItems[0]?.id ?? 0, quantityBase: 0, orderTypeScope: 'ALL' }])}>
                + {t('addLine')}
              </button>
                </>
              )}
            </>
          )}

          {/* The packaging-bundle pickers that sat here are gone. A bundle ("large hot cup
              = cup + lid + sleeve") is a second way to spend stock, in parallel with the
              recipe, and the café has to build the bundles somewhere else before either
              dropdown can offer anything but "None" — so in practice they were two controls
              that could not be used and could not be explained. Cups and lids are ordinary
              ingredients: tick them like everything else. The packaging_rules tables and
              their endpoints are untouched for whoever needs bundles later. */}

          {m !== 'NONE' && allOptions.length > 0 && (
            <div className="stk-optgroup">
              <h4>{t('optionExtras')}</h4>
              <p className="stk-hint">{t('optionHint')}</p>
              {allOptions.map(({ option }) => {
                const id = option.id!;
                const rows = optionLines[id] ?? [];
                return (
                  <div className="stk-opt" key={id}>
                    <span className="lbl">{pick(option, 'name', lang)}</span>
                    {rows.map((l, idx) => (
                      <div className="stk-line" key={idx}>
                        <select value={l.stockItemId}
                          onChange={(e) => setOptLine(id, idx, { stockItemId: Number(e.target.value) })}>
                          {stockItems.map((s) => <option key={s.id} value={s.id}>{pick(s, 'name', lang)}</option>)}
                        </select>
                        <label><span>{t('amount')} ({unitOf(l.stockItemId).toLowerCase()})</span>
                          {/* Negative is legitimate here: an option that swaps something out. */}
                          <NumField step="0.1" value={l.quantityBase}
                            onValue={(n) => setOptLine(id, idx, { quantityBase: n ?? 0 })} /></label>
                        <button className="x"
                          onClick={() => setOptLines({ ...optionLines, [id]: rows.filter((_, i) => i !== idx) })}
                          aria-label="remove">✕</button>
                      </div>
                    ))}
                    <button className="btn sm ghost" disabled={stockItems.length === 0}
                      onClick={() => setOptLines({
                        ...optionLines,
                        [id]: [...rows, { stockItemId: stockItems[0]?.id ?? 0, quantityBase: 0, orderTypeScope: 'ALL' }],
                      })}>
                      + {t('addLine')}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {(recipe?.allergens?.length ?? 0) > 0 && (
            <div className="stk-f">
              <span>{t('allergens')}</span>
              <div className="stk-chips">
                {recipe!.allergens.map((a) => <button key={a} type="button" className="on">{a.toLowerCase()}</button>)}
              </div>
            </div>
          )}

          {/* The payoff: cost, food-cost % and margin, live as you type. */}
          {m !== 'NONE' && (
            <div className="stk-cost">
              <div><span>{t('cost')}</span><b>{omr(shownCost)}</b></div>
              {packCost > 0 && <div><span>{t('packagingCost')}</span><b>{omr(packCost)}</b></div>}
              <div><span>{t('price')}</span><b>{omr(price)}</b></div>
              <div><span>{t('foodCost')}</span>
                <b className={foodCostPct == null ? '' : foodCostPct <= 25 ? 'good' : foodCostPct <= 40 ? 'warn' : 'bad'}>
                  {foodCostPct == null ? '—' : `${foodCostPct.toFixed(1)}%`}
                </b></div>
              <div><span>{t('margin')}</span><b className={margin > 0 ? 'good' : 'bad'}>{omr(margin)}</b></div>
            </div>
          )}
        </div>

        <div className="stk-sheet-ft">
          <button className="btn ghost" onClick={onClose}>{t('close')}</button>
          <button className="btn" onClick={() => save.mutate()} disabled={save.isPending}>{t('save')}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * One ingredient that is actually in the dish: what it is, how much of it, what that costs.
 *
 * The amount is its own control rather than part of the row's hit area — changing 200 ml to
 * 120 ml must never be one mistap away from removing the milk. Removal is the ✕, which is
 * what people reach for when a thing is already in a list.
 */
function IngredientRow({ s, lang, t, amount, onAmount, onRemove }: {
  s: StockItemRow; lang: 'en' | 'ar'; t: (k: string) => string;
  amount: number; onAmount: (n: number | null) => void; onRemove: () => void;
}) {
  const name = pick(s, 'name', lang);
  const unit = s.baseUnit === 'PIECE' ? t('pieces') : s.baseUnit.toLowerCase();
  const cost = amount * (1 + (s.wastePct || 0) / 100) * s.costPerBaseUnit;
  return (
    <div className="stk-tick on">
      <span className="stk-tick-hit as-label">
        <span className="stk-tick-box" aria-hidden>✓</span>
        <span className="stk-tick-name">{name}</span>
      </span>
      <span className="stk-tick-amt">
        <NumField step="0.1" value={amount} aria-label={`${name} — ${unit}`} onValue={onAmount} />
        <i>{unit}</i>
      </span>
      <span className="stk-tick-cost num">{cost > 0 ? omr(cost) : '—'}</span>
      <button type="button" className="stk-tick-x" onClick={onRemove} aria-label={`${t('remove')} ${name}`}>✕</button>
    </div>
  );
}
