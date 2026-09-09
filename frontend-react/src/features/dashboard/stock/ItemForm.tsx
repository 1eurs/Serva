import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useConfirm } from '../../../lib/confirm';
import { useI18n, pick } from '../../../lib/i18n';
import { useToast } from '../../../lib/toast';
import type {
  MenuItemResponse, RecipeResponse, StockItemPayload, StockItemRow,
} from '../../../lib/types';
import NumField from '../NumField';
import { AISLES, aisleLabel, aisleStore, aisleSuggestions } from './aisles';
import { Rail, Sheet, withMoney } from './parts';
import {
  PACK_ORDER, PACK_UNITS, PRESETS, type PackUnit, type Preset,
  fill, packUnitOf, qty, unitTag,
} from './units';

type T = (k: string) => string;

/**
 * Adding what you buy — the screen owners told us was the hard part, and the screen the whole
 * feature starts at.
 *
 * <p>The unit model used to be four disconnected fields: counted in grams, bought as a 1 kg
 * bag that holds 1000 grams, costed per gram. That says the pack twice, in two units, and
 * makes the owner do the conversion. It asks instead for the pack the way the invoice in
 * their hand writes it — a number, a unit, a price — and reads everything else off it.
 *
 * <p>Two things are new, and both exist because of what owners reported afterwards.
 *
 * <p><b>The opening count now sets an order line.</b> An item with a figure but no line has
 * nowhere to sit on the shelf's axis, and the only thing that could give it one was a count
 * later that evening. One pack is the honest opening guess — you order when you are down to
 * less than a pack — and it is shown, in words, as a guess tonight's count can move.
 *
 * <p><b>It asks what uses the thing.</b> This is the step that was missing entirely. Owners
 * added twelve ingredients, watched every number sit perfectly still, and concluded stock was
 * broken; the half that makes them move lived behind a second tab nobody opened. Asked here,
 * while the ingredient is the thing they are already thinking about, it costs a few taps.
 */
export default function ItemForm({ t, branchId, queryKey, item, categories, onClose }: {
  t: T; branchId?: number; queryKey: unknown[];
  item: StockItemRow | null; categories: string[]; onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { lang } = useI18n();
  const rid = useAuth().user?.restaurantId;

  /* Par and reorder point are not on this form, not even as hidden state. They are live and
     per-branch, and a form that carries a value it cannot show cannot notice when the value
     has moved on underneath it. */
  type Form = Omit<StockItemPayload,
    'baseUnit' | 'purchaseUnitSize' | 'purchaseUnitLabel' | 'costPerBaseUnit'>;
  const [f, setF] = useState<Form>({
    nameEn: item?.nameEn ?? '', nameAr: item?.nameAr ?? '',
    kind: item?.kind ?? 'INGREDIENT',
    wastePct: item?.wastePct ?? 0,
    batchYieldBase: item?.batchYieldBase ?? null, category: item?.category ?? '',
    servingsPerPack: item?.servingsPerPack ?? null,
    countFrequency: item?.countFrequency ?? null, allergens: item?.allergens ?? [],
    supplierId: item?.supplierId ?? null,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const [pack, setPack] = useState<{ amount: number | null; unit: PackUnit; label: string }>(() => {
    const stored = item && item.purchaseUnitSize > 0 ? item.purchaseUnitSize : 0;
    const unit = item ? packUnitOf(item.baseUnit, stored) : 'KG';
    return {
      amount: stored > 0 ? stored / PACK_UNITS[unit].per : 1,
      unit,
      label: item?.purchaseUnitLabel?.trim() || '',
    };
  });
  /* A pack counted in pieces answers its own yield: fifty cups is fifty servings. So it is
     filled in — and kept in step with the pack — until the owner says otherwise. */
  const [yieldTyped, setYieldTyped] = useState(false);

  const editPack = (next: Partial<{ amount: number | null; unit: PackUnit }>) => {
    setPack((p) => {
      const q = { ...p, ...next };
      return { ...q, label: `${q.amount ?? 1} ${t(`u${q.unit}`)}` };
    });
    if (yieldTyped) return;
    const q = { amount: pack.amount, unit: pack.unit, ...next };
    setF((s) => ({
      ...s,
      servingsPerPack: q.unit === 'PIECE' ? q.amount
        // Leaving pieces takes the piece count with it — 50 was the number of lids, and it
        // means nothing once the pack is a kilo.
        : pack.unit === 'PIECE' ? null
          : s.servingsPerPack,
    }));
  };

  const [preset, setPreset] = useState<string | null>(null);
  const [catText, setCatText] = useState(() => aisleLabel(item?.category, lang));
  const applyPreset = (p: Preset) => {
    setPreset(p.en);
    setYieldTyped(false);
    setCatText(AISLES[p.cat as keyof typeof AISLES][lang]);
    setF((s) => ({ ...s, nameEn: p.en, nameAr: p.ar, category: p.cat, servingsPerPack: p.servings }));
    setPack({ amount: p.amount, unit: p.unit, label: `${p.amount} ${t(`u${p.unit}`)}` });
  };

  const catChips = useMemo(() => {
    const mine = categories.map((c) => aisleLabel(c, lang)).filter(Boolean);
    return [...new Set([...mine, ...aisleSuggestions(lang)])];
  }, [categories, lang]);

  const baseUnit = PACK_UNITS[pack.unit].base;
  const size = pack.amount && pack.amount > 0
    ? Math.round(pack.amount * PACK_UNITS[pack.unit].per * 1000) / 1000 : 0;
  const packWord = pack.label || `${pack.amount ?? 1} ${t(`u${pack.unit}`)}`;

  const [packCost, setPackCost] = useState<string>(
    item && item.costPerBaseUnit > 0
      ? String(Number((item.costPerBaseUnit * (item.purchaseUnitSize || 1)).toFixed(3)))
      : '');
  const packCostNum = Number(packCost);
  const perBase = size > 0 && Number.isFinite(packCostNum) && packCostNum > 0 ? packCostNum / size : 0;
  const servingsPerPack = Number(f.servingsPerPack) || 0;
  const servingBase = servingsPerPack > 0 && size > 0 ? size / servingsPerPack : 0;

  const [opening, setOpening] = useState<number | null>(null);
  const openingBase = opening != null && opening > 0 && size > 0
    ? Math.round(opening * size * 1000) / 1000 : 0;

  /* What uses it. Only when adding, and only once the pack says how far one goes: without a
     yield there is no honest amount to write into a recipe line, and a line of "some milk"
     helps nobody. */
  const menuQ = useQuery({
    queryKey: ['menu-items', rid],
    queryFn: () => api.get<MenuItemResponse[]>(`/api/menu/items?restaurantId=${rid}`),
    enabled: !item && rid != null,
  });
  const menu = menuQ.data ?? [];
  const [uses, setUses] = useState<number[]>([]);
  const toggleUse = (id: number) =>
    setUses((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const problem = !f.nameEn.trim() && !f.nameAr.trim() ? t('needName')
    : size <= 0 ? t('needPack')
      : null;

  const save = useMutation({
    mutationFn: async () => {
      const name = f.nameEn.trim() || f.nameAr.trim();
      const body: StockItemPayload = {
        nameEn: f.nameEn.trim() || name, nameAr: f.nameAr.trim() || name,
        kind: f.kind, baseUnit,
        purchaseUnitLabel: packWord,
        purchaseUnitSize: size,
        costPerBaseUnit: perBase,
        wastePct: Number(f.wastePct) || 0,
        batchYieldBase: f.kind === 'PREP' ? Number(f.batchYieldBase) || 1 : null,
        servingsPerPack: servingsPerPack > 0 ? servingsPerPack : null,
        category: aisleStore(f.category), countFrequency: f.countFrequency ?? null,
        allergens: f.allergens ?? [], supplierId: f.supplierId ?? null,
      };
      if (item) return api.patch<StockItemRow>(`/api/dashboard/stock/items/${item.id}`, body);

      const saved = await api.post<StockItemRow>('/api/dashboard/stock/items', body);

      /* An opening count is a count, so it goes through the same door every other count does
         and leaves the same line in the ledger. Only when one was actually given — an
         untouched field must not create the level row, because a level row that exists means
         the item has been counted, and counted-at-zero means "run out". */
      if (openingBase > 0) {
        await api.patch(`/api/dashboard/stock/items/${saved.id}/levels`, {
          branchId, parLevelBase: openingBase, reorderPointBase: size,
        });
        await api.post('/api/dashboard/stock/adjust', {
          branchId, stockItemId: saved.id, quantityBase: openingBase,
          note: t('openNote'), counted: true,
        });
      }

      /* Each ticked menu item gets a recipe line for one serving. Read-modify-write, because
         the endpoint replaces a whole recipe and these items usually have one already. */
      for (const menuItemId of uses) {
        const cur = await api.get<RecipeResponse>(
          `/api/dashboard/stock/menu-items/${menuItemId}/recipe`);
        await api.put(`/api/dashboard/stock/menu-items/${menuItemId}/recipe`, {
          stockMode: 'RECIPE',
          stockItemId: null,
          dailyLimit: cur.dailyLimit ?? null,
          packagingRuleId: cur.packagingRuleId ?? null,
          optionRecipes: cur.optionRecipes ?? [],
          lines: [
            ...(cur.lines ?? []).filter((l) => l.stockItemId !== saved.id),
            { stockItemId: saved.id, quantityBase: servingBase },
          ],
        });
      }
      return saved;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ['menu-items', rid] });
      toast(uses.length > 0 ? fill(t('usesLinked'), { n: uses.length }) : t('saved'));
      onClose();
    },
    onError: (e: Error) => toast(e.message),
  });

  const archive = useMutation({
    mutationFn: () => api.del(`/api/dashboard/stock/items/${item!.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey }); toast(t('archived')); onClose(); },
    onError: (e: Error) => toast(e.message),
  });

  return (
    <Sheet title={item ? pick(f, 'name', lang) || t('addItem') : t('addItem')} onClose={onClose}
      onSubmit={() => save.mutate()} submitLabel={t('save')} busy={save.isPending}
      problem={problem}>

      {/* Only when adding. On an existing item these would be twelve buttons that quietly
          overwrite what is already there. One sideways line, not a wrapped block: twelve of
          these on four rows pushed the actual question off the bottom of a phone. */}
      {!item && (
        <div className="stk-presets">
          <span className="stk-sec-h">{t('startFrom')}</span>
          <Rail>
            {PRESETS.map((p) => (
              <button type="button" key={p.en} className={`stk-chip${preset === p.en ? ' on' : ''}`}
                onClick={() => applyPreset(p)}>{lang === 'ar' ? p.ar : p.en}</button>
            ))}
          </Rail>
        </div>
      )}

      {/* The reader's own language is the required one and comes first. English-first in an
          Arabic UI meant an Arabic café typed Arabic into the field labelled English. */}
      <div className="stk-grid" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        {(lang === 'ar' ? (['nameAr', 'nameEn'] as const) : (['nameEn', 'nameAr'] as const))
          .map((k, idx) => (
            <label className="stk-f" key={k}>
              <span>{t(k)}{idx === 1 ? ` · ${t('optional')}` : ''}</span>
              <input dir={k === 'nameAr' ? 'rtl' : 'ltr'}
                value={k === 'nameAr' ? f.nameAr : f.nameEn}
                placeholder={idx === 1 ? (k === 'nameAr' ? f.nameEn : f.nameAr) : undefined}
                autoFocus={!item && idx === 0}
                onChange={(e) => set(k, e.target.value)} />
            </label>
          ))}
      </div>

      {/* Typed as a word, filed as an aisle: a suggestion that matches one of the usual set is
          stored as its key, so the shelf can print it in whichever language is reading.
          Anything else is the café's own word and is kept exactly as typed. */}
      <label className="stk-f"><span>{t('category')} · {t('optional')}</span>
        <input value={catText} placeholder={t('categoryEg')} list="stk-cats"
          onChange={(e) => { setCatText(e.target.value); set('category', e.target.value); }} />
        <datalist id="stk-cats">{catChips.map((c) => <option key={c} value={c} />)}</datalist>
      </label>

      {/* The pack sentence. Read it out loud and it is what the owner would say, and what the
          invoice in their hand says: a number, a unit, a price. */}
      <div className="stk-spec">
        {t('packA')}{' '}
        <NumField className="w-amt" value={pack.amount} aria-label={t('packAmountAria')}
          min="0" step="0.5" onValue={(n) => editPack({ amount: n })} />
        <select value={pack.unit} aria-label={t('packUnitAria')}
          onChange={(e) => editPack({ unit: e.target.value as PackUnit })}>
          {PACK_ORDER.map((u) => <option key={u} value={u}>{t(`u${u}`)}</option>)}
        </select>
        {' '}{t('packB')}{' '}
        <input className="w-cost" type="number" inputMode="decimal" min="0" step="0.001"
          value={packCost} aria-label={t('packCostAria')}
          onChange={(e) => setPackCost(e.target.value)} />
        {/* No full stop of its own: the Arabic abbreviation ends in one already. */}
        {' '}{t('specCurrency')}
        <div className="stk-spec-sum">
          {perBase > 0 ? (
            <>
              <span>{fill(t('specPerBase'), {
                c: perBase.toFixed(6).replace(/\.?0+$/, ''), u: t(`${baseUnit}1`),
              })}</span>
              <span>{fill(t('specCountedIn'), { u: t(baseUnit) })}</span>
            </>
          ) : <span>{t('specFillHint')}</span>}
        </div>
      </div>

      {/* The yield. One number, and it is the number that makes cup cost possible without
          anyone typing a gram — a recipe line is just this said backwards. */}
      <div className="stk-spec">
        <span className="stk-spec-opt">{t('optional')}</span>
        {t('yield1')}{' '}
        <NumField className="w-num" value={f.servingsPerPack ?? null} aria-label={t('yieldAria')}
          onValue={(n) => { setYieldTyped(true); set('servingsPerPack', n); }} />
        {' '}{t('yield2')}
        <div className="stk-spec-sum">
          {servingBase > 0 ? (
            <>
              <span>{fill(t('yieldPer'), {
                q: qty(servingBase, baseUnit), u: unitTag(baseUnit, t) || t(`${baseUnit}1`),
              })}</span>
              {perBase > 0 && (
                <span className="stk-yield-cost">
                  {withMoney(t('yieldCost'), perBase * servingBase)}
                </span>
              )}
            </>
          ) : <span>{t('yieldHint')}</span>}
        </div>
      </div>

      {!item && (
        <>
          {/* What is there now. Asked in packs, because the invoice is in their hand and
              nobody knows their shelf in grams. Optional: left blank, the item is honestly
              "not counted" rather than "out". */}
          <div className="stk-spec">
            <span className="stk-spec-opt">{t('optional')}</span>
            {t('openA')}{' '}
            <NumField className="w-num" value={opening} aria-label={t('openAria')}
              min="0" step="0.5" onValue={setOpening} />
            {' '}{t('openB')}
            <div className="stk-spec-sum">
              {openingBase > 0 ? (
                <span>{fill(t('openLands'), {
                  q: `${qty(openingBase, baseUnit)} ${baseUnit === 'PIECE' ? t('PIECE') : unitTag(baseUnit, t)}`,
                })}</span>
              ) : <span>{t('openHint')}</span>}
            </div>
          </div>

          {/* The step the feature never had. */}
          {menu.length > 0 && (
            <div className="stk-uses-pick">
              <span className="stk-sec-h">{t('usesQ')}</span>
              {servingBase > 0 ? (
                <>
                  <p className="stk-hint">
                    {fill(t('usesHint'), {
                      name: (lang === 'ar' ? f.nameAr : f.nameEn) || t('addItem'),
                    })}
                  </p>
                  {/* Wrapped, not railed. The shelf's filters and the presets above are
                      closed vocabularies that fit a line; a café's menu is neither, and it
                      grows. On one line most of it sat behind a sideways drag nobody could
                      see, with no way at all to make that drag with a plain mouse. Nothing
                      follows this section in the form, so the block can be as tall as the
                      menu is long — which is what makes it scannable. */}
                  <div className="stk-chiplist">
                    {menu.map((m) => (
                      <button type="button" key={m.id}
                        className={`stk-chip${uses.includes(m.id) ? ' on' : ''}`}
                        aria-pressed={uses.includes(m.id)}
                        onClick={() => toggleUse(m.id)}>{pick(m, 'name', lang)}</button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="stk-hint">{t('usesNeedYield')}</p>
              )}
            </div>
          )}
        </>
      )}

      {item && (
        <div>
          <button className="btn sm danger" onClick={async () => {
            if (await confirm({
              title: `${t('archive')} · ${pick(item, 'name', lang)}`,
              message: t('archiveWarn'), confirmLabel: t('archive'), danger: true,
            })) archive.mutate();
          }}>{t('archive')}</button>
        </div>
      )}
    </Sheet>
  );
}
