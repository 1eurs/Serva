import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useI18n, useT, pick, type Dict } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import { useConfirm } from '../../lib/confirm';
import { omr } from '../../lib/format';
import type {
  BaseUnit, CoverRow, MovementRow, ReorderSuggestion, StockItemPayload, StockItemRow,
  Restaurant, StockOverview, WasteReason,
} from '../../lib/types';
import './stock.css';
import NumField from './NumField';
import StockSweep from './StockSweep';

const DICT: Dict = {
  ar: {
    /* قائمة الطلب — مخرَج الجولة، ورسالة تُرسَل للمورّد */
    orderTitle: 'يحتاج طلب ({n})', copyOrder: 'انسخ للواتساب', copied: 'انتسخت',
    copyFailed: 'ما قدرنا ننسخ. حدّدها وانسخها يدوياً.', orderEst: 'تقريباً {v}',
    categoryEg: 'بن، حليب، تغليف…',
    levelsBySweep: 'حدود التنبيه تتضبط في جولة الرفوف — ما يحتاج تكتبها هنا.',

    /* مخفي عن قائمة العملاء — أغلى شي يسويه المخزون، فلا يصير بصمت */
    offTitle: '{n} من قائمتك مخفية عن العملاء',
    offSub: 'ما يقدرون يطلبونها الحين. اضغط على السبب عشان تفتح الصنف الناقص.',
    offOut: 'نفد {name}', offOutPlain: 'ناقص مكوّن', offLimit: 'خلص حدّها اليومي',
    offSubWarnOnly: 'ما زالت معروضة للعملاء — أنت طلبت إن المخزون ما يخفي شي لحاله.',
    autoHideLabel: 'خلّ المخزون يخفي الصنف إذا خلص مكوّنه',
    autoHideHintOn: 'شغّالة: أي صنف ناقص مكوّنه يختفي من قائمة العملاء تلقائياً.',
    autoHideHintOff: 'مطفية: ننبّهك بس، وما نخفي شي — القرار لك.',
    autoHideOn: 'صار يخفي تلقائياً', autoHideOff: 'وقفنا الإخفاء التلقائي',

    /* العنوان */
    onShelves: 'قيمة ما على الرفوف', situation: 'حالة المخزون الآن',
    clauseOut: 'نفد', clauseLow: 'يحتاج طلباً', clauseSoon: 'ينفد الليلة',
    allClear: 'كل شي متوفر.', allClearSub: 'ما في صنف تحت حدّ التنبيه، وما في شي متوقع ينفد اليوم.',
    roomAria: 'مستويات {n} صنف على الرفوف',
    unmeasured: '{n} من {total} صنف بلا حدّ بعد — جولة الرفوف تضبطها.',
    show: 'اعرض', hide: 'إخفاء',

    /* الأفعال اليومية */
    sweep: 'جولة الرفوف',
    logDelivery: 'تسجيل توريد', logWaste: 'تسجيل هدر', recount: 'إعادة العد', edit: 'تعديل الصنف',
    recountHint: 'سجّل الكمية الموجودة فعلاً على الرف. الفرق يُسجَّل في السجل كتصحيح.',

    /* الرفوف */
    search: 'ابحث في المخزون', addItem: 'صنف جديد', fAll: 'الكل',
    filters: 'تصفية الرفوف',
    needsYou: 'يحتاج انتباهك', uncategorised: 'بدون تصنيف', diff: 'الفرق',
    noItems: 'ما في أصناف بعد', noItemsSub: 'ابدأ بالبن والحليب والأكواب — وأضف الباقي وقت ما توصل الفاتورة.',
    noMatch: 'ما في صنف بهذا الاسم.',
    stOut: 'نفد', stLow: 'اطلبه الحين', stOk: 'تمام', stDays: '~{n} يوم', stUnset: 'ما فيه حدّ تنبيه',

    /* لوحة الصنف */
    onHand: 'المتوفر', daysCover: 'يكفي', days: 'يوم', perDay: 'الاستهلاك اليومي',
    costPack: 'سعر العبوة', reorderAt: 'ننبّهك عند', notSet: 'غير محدد',
    recent: 'آخر الحركات', noMovements: 'ما في حركات بعد.',

    /* نموذج الصنف */
    nameEn: 'الاسم (إنجليزي)', nameAr: 'الاسم (عربي)',
    specCount1: 'أحسبه بالـ', specBuy1: 'وأشتريه كـ', specBuy2: 'فيها', specBuy3: 'وتكلّفني',
    specCurrency: 'ر.ع.',
    specPerBase: '{c} لكل {u}', specPerPack: '{c} لكل {p}', specFillHint: 'اكتب سعر العبوة كما هو في الفاتورة.',
    yield1: 'و{p} تكفي تقريباً', yield2: 'حصة.', yieldAria: 'عدد الحصص في العبوة',
    yieldPer: 'يعني {q} {u} للحصة', yieldCost: '{c} تكلفة الحصة',
    yieldHint: 'تقدير كافي — كم كوب يطلع من العبوة؟ منها نحسب تكلفة الكوب.',
    category: 'التصنيف',
    save: 'حفظ', cancel: 'إلغاء', archive: 'أرشفة الصنف', archived: 'تمت الأرشفة', archiveWarn: 'يختفي من المخزون. الحركات والوصفات تبقى كما هي.',
    add: 'إضافة', saved: 'تم الحفظ',
    G: 'جرام', ML: 'مل', PIECE: 'حبة',
    G1: 'جرام', ML1: 'مل', PIECE1: 'حبة',

    /* التوريد والهدر */
    quantity: 'الكمية', reason: 'السبب', note: 'ملاحظة', record: 'تسجيل',
    addLine: 'صنف آخر', packs: 'عدد العبوات', pack1: 'العبوة', costPer: 'سعر',
    enterInUnit: 'أدخلها بالـ{u}', enterInPacks: 'أدخلها بالعبوات', lands: 'يدخل المخزون',
    SPILLED: 'انسكب', EXPIRED: 'منتهي', STAFF_MEAL: 'وجبة موظفين', COMP: 'مجاملة',
    TRAINING: 'تدريب', DAMAGED: 'تالف', OTHER: 'أخرى',

    /* أسباب الحركة — تظهر في آخر الحركات داخل لوحة الصنف */
    items: 'أصناف',
    RECEIVE: 'توريد', SALE: 'بيع', WASTE: 'هدر', COUNT: 'جرد', TRANSFER_IN: 'تحويل وارد',
    TRANSFER_OUT: 'تحويل صادر', MANUAL: 'تصحيح', ORDER_RESTORE: 'إرجاع طلب',
    PREP_PRODUCE: 'إنتاج دفعة', PREP_CONSUME: 'استهلاك دفعة',
  },
  en: {
    /* the order list — the sweep's output, and a message you send your supplier */
    orderTitle: 'To order ({n})', copyOrder: 'Copy for WhatsApp', copied: 'Copied',
    copyFailed: 'Could not copy. Select the list and copy it by hand.', orderEst: 'About {v}',
    categoryEg: 'Coffee, dairy, packaging…',
    levelsBySweep: 'Warning levels get set during the shelf sweep — no need to type them here.',

    /* hidden from the customer menu — the costliest thing stock does, so never silently */
    offTitle: '{n} off your menu right now',
    offSub: 'Customers cannot order these. Tap the reason to open the ingredient to buy.',
    offOut: 'out of {name}', offOutPlain: 'an ingredient ran out', offLimit: "hit today's limit",
    offSubWarnOnly: 'Customers can still order these — you asked stock not to hide anything on its own.',
    autoHideLabel: 'Let stock hide an item when an ingredient runs out',
    autoHideHintOn: 'On: anything short of an ingredient disappears from the customer menu by itself.',
    autoHideHintOff: 'Off: stock warns you here and leaves the menu alone. You decide.',
    autoHideOn: 'Stock will hide sold-out items', autoHideOff: 'Stock will only warn you',

    /* headline */
    onShelves: 'On the shelves', situation: 'Right now',
    clauseOut: 'run out', clauseLow: 'to order', clauseSoon: 'gone tonight',
    allClear: 'Everything is stocked.', allClearSub: 'Nothing is below its reorder point, and nothing is due to run out today.',
    roomAria: 'Stock levels across {n} items',
    unmeasured: '{n} of {total} items have no level yet — a shelf sweep sets them.',
    show: 'Show', hide: 'Hide',

    /* daily verbs */
    sweep: 'Shelf sweep',
    logDelivery: 'Log delivery', logWaste: 'Log waste', recount: 'Recount', edit: 'Edit item',
    recountHint: 'Set what is actually on the shelf. The difference is recorded in History as a correction.',

    /* shelf */
    search: 'Search stock', addItem: 'New item', fAll: 'All',
    filters: 'Filter the shelf',
    needsYou: 'Needs you', uncategorised: 'Uncategorised', diff: 'Difference',
    noItems: 'Nothing on the shelf yet', noItemsSub: 'Start with beans, milk and cups — add the rest when the invoice is in front of you.',
    noMatch: 'No item by that name.',
    stOut: 'Out', stLow: 'Order now', stOk: 'OK', stDays: '~{n} days', stUnset: 'No reorder point',

    /* item panel */
    onHand: 'On hand', daysCover: 'Lasts', days: 'days', perDay: 'Used per day',
    costPack: 'Cost per pack', reorderAt: 'Warn at', notSet: 'Not set',
    recent: 'Recent movements', noMovements: 'No movements yet.',

    /* item form */
    nameEn: 'Name (English)', nameAr: 'Name (Arabic)',
    specCount1: 'I count it in', specBuy1: 'and I buy it as a', specBuy2: 'that holds', specBuy3: 'and costs me',
    specCurrency: 'OMR',
    specPerBase: '{c} per {u}', specPerPack: '{c} per {p}', specFillHint: 'Type the pack price straight off the invoice.',
    yield1: 'One {p} makes about', yield2: 'servings.', yieldAria: 'Servings per pack',
    yieldPer: 'That is {q} {u} a serving', yieldCost: '{c} a serving',
    yieldHint: 'A rough count is enough — how many cups come out of one pack? Cup cost comes from this.',
    category: 'Category',
    save: 'Save', cancel: 'Cancel', archive: 'Archive item', archived: 'Archived', archiveWarn: 'It leaves your stock list. History and recipes keep working.',
    add: 'Add', saved: 'Saved',
    G: 'grams', ML: 'ml', PIECE: 'pieces',
    G1: 'gram', ML1: 'ml', PIECE1: 'piece',

    /* deliveries & waste */
    quantity: 'Quantity', reason: 'Reason', note: 'Note', record: 'Record',
    addLine: 'Another item', packs: 'Packs', pack1: 'pack', costPer: 'Cost per',
    enterInUnit: 'enter in {u} instead', enterInPacks: 'enter in packs instead', lands: 'lands on the shelf',
    SPILLED: 'Spilled', EXPIRED: 'Expired', STAFF_MEAL: 'Staff meal', COMP: 'Comped',
    TRAINING: 'Training', DAMAGED: 'Damaged', OTHER: 'Other',

    /* movement reasons — shown in Recent movements on the item panel */
    items: 'items',
    RECEIVE: 'Delivery', SALE: 'Sale', WASTE: 'Waste', COUNT: 'Count', TRANSFER_IN: 'Transfer in',
    TRANSFER_OUT: 'Transfer out', MANUAL: 'Correction', ORDER_RESTORE: 'Order returned',
    PREP_PRODUCE: 'Batch made', PREP_CONSUME: 'Batch inputs',
  },
};

type T = (k: string) => string;
/** Which slice of the shelf is on screen. Set by tapping a number in the headline. */
type Filter = 'all' | 'out' | 'low' | 'soon';

/** Every sheet on the page is opened from one place, so any screen can open any of them. */
type Sheet =
  | { k: 'receive'; itemId?: number }
  | { k: 'waste'; itemId?: number }
  | { k: 'adjust'; id: number }
  | { k: 'edit'; id: number | null }
  | { k: 'item'; id: number }
  | { k: 'sweep' };

const WASTE_REASONS: WasteReason[] = ['SPILLED', 'EXPIRED', 'STAFF_MEAL', 'COMP', 'TRAINING', 'DAMAGED', 'OTHER'];

/** Pieces are whole things; grams and millilitres get one decimal. */
const qty = (n: number | null | undefined, unit?: BaseUnit | null): string => {
  const v = Number(n ?? 0);
  return unit === 'PIECE' ? String(Math.round(v)) : v.toFixed(1);
};
/** The unit as it reads next to a number: "820 g", "4" for pieces. */
const unitTag = (u?: BaseUnit | null): string => (u === 'G' ? 'g' : u === 'ML' ? 'ml' : '');
const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), s);

/** How each counting unit is normally bought — used to prefill the purchase unit. */
const UNIT_DEFAULTS: Record<BaseUnit, { label: string; size: number }> = {
  G: { label: '1 kg', size: 1000 },
  ML: { label: '1 L', size: 1000 },
  PIECE: { label: 'each', size: 1 },
};

type Level = 'out' | 'low' | 'ok' | 'unset';
/**
 * "Never stocked" and "ran out" are not the same news, and only one of them is an alarm.
 * An item added off an invoice this morning has no par and no stock — calling that
 * "run out" puts a red number in front of the owner for something that has never been
 * on the shelf, and red numbers that mean nothing are how a screen stops being read.
 */
const levelOf = (i: StockItemRow): Level =>
  i.parLevel == null && i.reorderPoint == null ? 'unset'
    : i.out || i.onHand <= 0 ? 'out'
      : i.low ? 'low'
        : 'ok';

/* ================================================================== page */

export default function StockPage({ branchId }: { branchId?: number | null }) {
  const { user } = useAuth();
  const t = useT(DICT);

  /* The sweep lives in the URL, alone among the sheets.
     It is the one thing on this page a person is sent to rather than finds: an owner
     WhatsApps /dashboard/stock/sweep to whoever is closing tonight, and it opens on the
     walk instead of on a stock screen they then have to read. Back leaves the sweep
     rather than the page, which is also what the phone's back gesture should do here. */
  const location = useLocation();
  const navigate = useNavigate();
  const onSweepUrl = /^\/dashboard\/stock\/sweep\/?$/.test(location.pathname);

  /* One sheet at a time, owned here — the item panel needs to hand off to the delivery
     sheet, the shelf needs to open the editor, and ordering needs to open a delivery. */
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

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
  /* How long what's on the shelf will last at the recent rate. Open to every plan, and the
     single most useful number on the page — "2 days" beats "820 g" for deciding anything. */
  const coverQ = useQuery({
    queryKey: [...key, 'cover'],
    queryFn: () => api.get<CoverRow[]>(`/api/dashboard/stock/insights/cover${suffix}`),
    retry: false,
  });

  const items = itemsQ.data ?? [];
  const overview = overviewQ.data;
  const cover = useMemo(
    () => new Map((coverQ.data ?? []).map((c) => [c.stockItemId, c])),
    [coverQ.data],
  );
  const suggestQ = useQuery({
    queryKey: [...key, 'suggestions'],
    queryFn: () => api.get<ReorderSuggestion[]>(`/api/dashboard/stock/reorder-suggestions${suffix}`),
  });

  if (!user) return null;

  const openSheet = (s: Sheet) => {
    if (s.k === 'sweep') { navigate('/dashboard/stock/sweep'); return; }
    setSheet(s);
  };
  const closeSweep = () => navigate('/dashboard/stock');
  const byId = (id: number) => items.find((i) => i.id === id);

  return (
    <div className="tables-wrap stock-page">
      <ShelfTab t={t} items={items} overview={overview} cover={cover} loading={itemsQ.isLoading}
        suggestions={suggestQ.data ?? []} filter={filter} setFilter={setFilter} openSheet={openSheet} />

      {sheet?.k === 'receive' && (
        <ReceiveSheet t={t} branchId={scope} items={items} queryKey={key}
          initialItemId={sheet.itemId} onClose={() => setSheet(null)} />
      )}
      {sheet?.k === 'waste' && (
        <WasteSheet t={t} branchId={scope} items={items} queryKey={key}
          initialItemId={sheet.itemId} onClose={() => setSheet(null)} />
      )}
      {sheet?.k === 'adjust' && byId(sheet.id) && (
        <AdjustSheet t={t} branchId={scope} queryKey={key} item={byId(sheet.id)!} onClose={() => setSheet(null)} />
      )}
      {sheet?.k === 'edit' && (
        <ItemEditor t={t} branchId={scope} queryKey={key}
          item={sheet.id == null ? null : byId(sheet.id) ?? null} onClose={() => setSheet(null)} />
      )}
      {sheet?.k === 'item' && byId(sheet.id) && (
        <ItemPanel t={t} branchId={scope} item={byId(sheet.id)!} cover={cover.get(sheet.id)}
          openSheet={openSheet} onClose={() => setSheet(null)} />
      )}
      {onSweepUrl && (
        <StockSweep branchId={scope} items={items} queryKey={key}
          onClose={closeSweep} onSeeOrders={() => { closeSweep(); setFilter('low'); }} />
      )}
    </div>
  );
}

/* ================================================================== gauge */

/**
 * The signature element. An item is a level, not a number: a track, a fill, and a hard
 * notch at the reorder point so "below the line" is literal rather than a colour you have
 * to remember the meaning of. Drawn identically wherever an item appears.
 */
function Gauge({ item }: { item: StockItemRow }) {
  const state = levelOf(item);
  if (item.parLevel == null && item.reorderPoint == null) {
    return <div className="stk-gauge unset" aria-hidden />;
  }
  /* Scale to par where there is one, otherwise to whichever is bigger of the reorder
     point and what's actually on hand — a full shelf should never overflow the track. */
  const ceiling = Math.max(item.parLevel ?? 0, item.reorderPoint ?? 0, item.onHand, 1);
  const pct = Math.max(0, Math.min(100, (item.onHand / ceiling) * 100));
  const mark = item.reorderPoint != null ? Math.min(100, (item.reorderPoint / ceiling) * 100) : null;
  return (
    <div className="stk-gauge" data-state={state} aria-hidden>
      <div className="stk-gauge-fill" style={{ inlineSize: `${pct}%` }} />
      {mark != null && <i className="stk-gauge-mark" style={{ insetInlineStart: `${mark}%` }} />}
    </div>
  );
}

/** The words next to the gauge. Days of cover wins when we have it — it is the decision. */
function stateLabel(item: StockItemRow, c: CoverRow | undefined, t: T): { text: string; tone: Level } {
  const state = levelOf(item);
  if (state === 'out') return { text: t('stOut'), tone: 'out' };
  if (state === 'low') return { text: t('stLow'), tone: 'low' };
  if (state === 'unset') return { text: t('stUnset'), tone: 'unset' };
  if (c?.daysLeft != null) return { text: fill(t('stDays'), { n: Math.round(c.daysLeft) }), tone: 'ok' };
  return { text: t('stOk'), tone: 'ok' };
}

function ItemRow({ item, cover, t, onOpen }: {
  item: StockItemRow; cover?: CoverRow; t: T; onOpen: () => void;
}) {
  const { lang } = useI18n();
  const state = levelOf(item);
  const label = stateLabel(item, cover, t);
  return (
    <button className="stk-item" data-state={state} onClick={onOpen}>
      <span className="stk-item-name">
        <b>{pick(item, 'name', lang)}</b>
        {item.category && <em>{item.category}</em>}
      </span>
      <span className="stk-item-qty">
        <b>{qty(item.onHand, item.baseUnit)}</b>
        <i>{unitTag(item.baseUnit)}</i>
      </span>
      <span className="stk-item-level">
        <Gauge item={item} />
        <span className="stk-item-state" data-tone={label.tone}>{label.text}</span>
      </span>
    </button>
  );
}

/* ================================================================== shelf */

/**
 * One screen, three layers, in the order a person uses them:
 *
 *   1. the situation — read once, at the top, and never restated;
 *   2. what needs a decision — two strips that stay one line until opened;
 *   3. the shelf — one panel you can walk, with the filter rail pinned above it.
 *
 * It used to be four stacked cards saying the same thing three ways (a tile row, an
 * off-the-menu banner, an order list, then a "Needs you" group repeating all of it)
 * before a single item appeared. Counts now live in exactly one place — the rail —
 * where they are also the control that shows you what they counted.
 */
function ShelfTab({ t, items, overview, cover, loading, suggestions, filter, setFilter, openSheet }: {
  t: T; items: StockItemRow[]; overview?: StockOverview; cover: Map<number, CoverRow>;
  loading: boolean; suggestions: ReorderSuggestion[]; filter: Filter; setFilter: (f: Filter) => void;
  openSheet: (s: Sheet) => void;
}) {
  const { lang } = useI18n();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');

  const categories = useMemo(
    () => [...new Set(items.map((i) => i.category?.trim()).filter(Boolean) as string[])].sort(),
    [items],
  );

  const endingIds = useMemo(
    () => new Set((overview?.endingToday ?? []).map((c) => c.stockItemId)),
    [overview],
  );

  /* Out first, then below reorder, then whatever is closest to running out. */
  const urgency = (i: StockItemRow) =>
    i.out || i.onHand <= 0 ? 0 : i.low ? 1 : endingIds.has(i.id) ? 2 : 3;

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items
      .filter((i) => {
        if (needle && !`${i.nameEn} ${i.nameAr} ${i.category ?? ''}`.toLowerCase().includes(needle)) return false;
        if (cat && (i.category ?? '') !== cat) return false;
        if (filter === 'out') return i.out || i.onHand <= 0;
        if (filter === 'low') return i.low;
        if (filter === 'soon') return endingIds.has(i.id);
        return true;
      })
      .sort((a, b) => urgency(a) - urgency(b)
        || pick(a, 'name', lang).localeCompare(pick(b, 'name', lang)));
  }, [items, q, cat, filter, endingIds, lang]);

  const sifting = filter !== 'all' || !!q.trim() || !!cat;
  const attention = sifting ? [] : shown.filter((i) => urgency(i) < 3);
  const rest = sifting ? shown : shown.filter((i) => urgency(i) === 3);

  /* Grouped by category, because that is how a stockroom is walked. */
  const groups = useMemo(() => {
    const m = new Map<string, StockItemRow[]>();
    for (const i of rest) {
      const k = i.category?.trim() || t('uncategorised');
      (m.get(k) ?? m.set(k, []).get(k)!).push(i);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rest, t]);

  /* The setup ladder is gone. It was three steps that had to be understood before anything
     worked, shown to someone who had not yet decided the feature was worth understanding.
     There is one step now — add what you buy — and the sweep does the rest by asking, at
     the shelf, the only question it needs. */
  if (loading) return <div className="center"><div className="spinner" /></div>;

  /* Every list on the panel is drawn the same way, so the shelf reads as one instrument
     however it has been sliced. */
  const rowsOf = (rows: StockItemRow[]) => rows.map((i) => (
    <ItemRow key={i.id} item={i} cover={cover.get(i.id)} t={t}
      onOpen={() => openSheet({ k: 'item', id: i.id })} />
  ));

  return (
    <>
      <Situation t={t} overview={overview} items={items} openSheet={openSheet} />

      <SoldOutStrip t={t} overview={overview} openSheet={openSheet} />
      <OrderStrip t={t} suggestions={suggestions} items={items} />

      <FilterRail t={t} q={q} setQ={setQ} cat={cat} setCat={setCat} categories={categories}
        overview={overview} filter={filter} setFilter={setFilter}
        onAdd={() => openSheet({ k: 'edit', id: null })} />

      {items.length === 0 ? (
        <p className="stk-empty"><b>{t('noItems')}</b>{t('noItemsSub')}</p>
      ) : shown.length === 0 ? (
        <p className="stk-empty">{t('noMatch')}</p>
      ) : (
        <div className="stk-shelf">
          {/* Unsifted, the shelf leads with whatever wants a decision and then falls into
              stockroom order. Sifted, the rail has already said what you are looking at,
              so a second header would only repeat it. */}
          {sifting ? (
            <div className="stk-rows">{rowsOf(shown)}</div>
          ) : (
            <>
              {attention.length > 0 && (
                <section className="stk-grp-sec">
                  <h4 className="stk-grp alert"><span>{t('needsYou')}</span><i>{attention.length}</i></h4>
                  <div className="stk-rows">{rowsOf(attention)}</div>
                </section>
              )}
              {/* `cat` drops each row's category tag: the header above it already said
                  "Dairy", and printing it again on every row is the kind of repetition
                  that made this page feel busy. "Needs you" keeps its tags — that group
                  is mixed, so there the tag is the only thing placing the item. */}
              {groups.map(([name, rows]) => (
                <section key={name} className="stk-grp-sec cat">
                  <h4 className="stk-grp"><span>{name}</span><i>{rows.length}</i></h4>
                  <div className="stk-rows">{rowsOf(rows)}</div>
                </section>
              ))}
            </>
          )}
        </div>
      )}

      {/* The one rule stock applies without being asked, stated where a rule belongs:
          at the foot of the thing it governs, not as a card above the shelf. */}
      <AutoHideRule t={t} />
    </>
  );
}

/* ================================================================== filter rail */

/**
 * The page's only control surface. Search, then the counts that want a decision, then
 * the stockroom's own categories — one line, scrolled sideways rather than wrapped, and
 * pinned to the top of the pane so the shelf is navigable from anywhere in a long list.
 *
 * The counts are here rather than in the headline on purpose. They were in both, which
 * is how a screen ends up with two ways to do one thing; a number you can act on belongs
 * next to the other things you can act on.
 */
function FilterRail({ t, q, setQ, cat, setCat, categories, overview, filter, setFilter, onAdd }: {
  t: T; q: string; setQ: (v: string) => void; cat: string; setCat: (v: string) => void;
  categories: string[]; overview?: StockOverview; filter: Filter; setFilter: (f: Filter) => void;
  onAdd: () => void;
}) {
  const counts = ([
    { f: 'out', n: overview?.outCount ?? 0, label: t('clauseOut'), tone: 'out' },
    { f: 'low', n: overview?.lowCount ?? 0, label: t('clauseLow'), tone: 'low' },
    { f: 'soon', n: overview?.endingTodayCount ?? 0, label: t('clauseSoon'), tone: 'soon' },
  ] as { f: Filter; n: number; label: string; tone: string }[]).filter((c) => c.n > 0);

  const clear = () => { setFilter('all'); setCat(''); };

  return (
    <div className="stk-bar">
      <input className="stk-bar-q" placeholder={t('search')} value={q}
        onChange={(e) => setQ(e.target.value)} aria-label={t('search')} />

      <div className="stk-rail" role="group" aria-label={t('filters')}>
        <button className={'stk-chip' + (filter === 'all' && !cat ? ' on' : '')}
          aria-pressed={filter === 'all' && !cat} onClick={clear}>{t('fAll')}</button>

        {counts.map((c) => (
          <button key={c.f} className={'stk-chip' + (filter === c.f ? ' on' : '')} data-tone={c.tone}
            aria-pressed={filter === c.f}
            onClick={() => setFilter(filter === c.f ? 'all' : c.f)}>
            <b>{c.n}</b>{c.label}
          </button>
        ))}

        {counts.length > 0 && categories.length > 0 && <span className="stk-rail-split" aria-hidden />}

        {categories.map((c) => (
          <button key={c} className={'stk-chip' + (cat === c ? ' on' : '')} aria-pressed={cat === c}
            onClick={() => setCat(cat === c ? '' : c)}>{c}</button>
        ))}
      </div>

      <button className="stk-add" onClick={onAdd}>
        <span aria-hidden>+</span><em>{t('addItem')}</em>
      </button>
    </div>
  );
}

/* ================================================================== strips */

/**
 * A thing that wants a decision, one line high until you ask for the detail.
 *
 * These two used to be full cards with saturated header bands — a red one and a yellow
 * one, stacked, both shouting before you had read the shelf. The alarm now lives in a
 * spine down the inline start, the summary names enough of the contents that opening is
 * usually unnecessary, and the page keeps one voice at speaking volume.
 */
function Strip({ tone, title, summary, action, children, t }: {
  tone: 'out' | 'low'; title: string; summary?: string;
  action?: React.ReactNode; children: React.ReactNode; t: T;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="stk-strip" data-tone={tone} role="status">
      <div className="stk-strip-hd">
        <div className="stk-strip-copy">
          <b>{title}</b>
          {summary && <span>{summary}</span>}
        </div>
        {action}
        <button className="stk-strip-open" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? t('hide') : t('show')}
          <i aria-hidden>▾</i>
        </button>
      </div>
      {open && <div className="stk-strip-bd">{children}</div>}
    </section>
  );
}

/**
 * What customers can no longer order, and the one thing to buy to fix it.
 *
 * Stock hides menu items on its own — that is the point of tracking it — but it used to
 * hide them silently. A drink would vanish from the customer menu and the first anyone
 * heard was a staff order failing at the till. This is the most expensive thing the
 * feature can do to a café, so it leads the strips: money you are not taking beats money
 * you are about to spend.
 */
function SoldOutStrip({ t, overview, openSheet }: {
  t: T; overview?: StockOverview; openSheet: (s: Sheet) => void;
}) {
  const { lang } = useI18n();
  const rows = overview?.soldOut ?? [];
  if (rows.length === 0) return null;

  const nameOf = (r: (typeof rows)[number]) => (r.nameEn || r.nameAr
    ? pick({ nameEn: r.nameEn ?? '', nameAr: r.nameAr ?? '' }, 'name', lang)
    : `#${r.menuItemId}`);

  return (
    <Strip t={t} tone="out"
      title={fill(t('offTitle'), { n: rows.length })}
      summary={rows.slice(0, 3).map(nameOf).join(' · ')}>
      <p className="stk-strip-note">{t('offSub')}</p>
      <ul className="stk-off-list">
        {rows.map((r) => (
          <li key={r.menuItemId}>
            <span className="stk-off-name">{nameOf(r)}</span>
            {r.reason === 'DAILY_LIMIT_REACHED' ? (
              <span className="stk-off-why">{t('offLimit')}</span>
            ) : r.blockerId ? (
              /* The ingredient is the fix, so it is the control: tapping opens the item
                 you have to buy rather than the drink you cannot sell. */
              <button className="stk-off-why link" onClick={() => openSheet({ k: 'item', id: r.blockerId! })}>
                {fill(t('offOut'), { name: r.blockerName ?? '' })}
              </button>
            ) : (
              <span className="stk-off-why">{t('offOutPlain')}</span>
            )}
          </li>
        ))}
      </ul>
    </Strip>
  );
}

/**
 * The café's own switch over the one thing stock does without being asked.
 *
 * It used to ride along with the sold-out banner, which meant a bordered card sat above
 * the shelf every day of the year to hold a checkbox nobody was looking for. A standing
 * rule reads as a footnote to the thing it governs, so that is where it goes.
 */
function AutoHideRule({ t }: { t: T }) {
  const qc = useQueryClient();
  const toast = useToast();
  const rid = useAuth().user?.restaurantId;
  const restaurantQ = useQuery({
    queryKey: ['restaurant', rid],
    queryFn: () => api.get<Restaurant>(`/api/restaurants/${rid}`),
    enabled: rid != null,
    retry: false,
  });
  const autoHide = restaurantQ.data?.autoHideOutOfStock ?? true;
  const setAutoHide = useMutation({
    mutationFn: (on: boolean) => api.patch(`/api/restaurants/${rid}`, { autoHideOutOfStock: on }),
    onSuccess: (_d, on) => {
      qc.invalidateQueries({ queryKey: ['restaurant', rid] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      toast(on ? t('autoHideOn') : t('autoHideOff'));
    },
    onError: (e: Error) => toast(e.message),
  });
  if (!restaurantQ.data) return null;

  return (
    <label className="stk-rule">
      <input type="checkbox" checked={autoHide} disabled={setAutoHide.isPending}
        onChange={(e) => setAutoHide.mutate(e.target.checked)} />
      <span>
        <b>{t('autoHideLabel')}</b>
        <em>{autoHide ? t('autoHideHintOn') : t('autoHideHintOff')}</em>
      </span>
    </label>
  );
}

/* ================================================================== to order */

/**
 * What the sweep is for.
 *
 * This replaces a whole Ordering tab that carried suppliers, purchase orders and a
 * DRAFT → SENT → PARTIAL → RECEIVED status machine. No café in Oman with four staff
 * runs procurement software; they send their supplier a WhatsApp message. So the output
 * of the feature is that message — a list you can read out loud, and a button that puts
 * it on the clipboard. The purchase-order endpoints are untouched on the server for
 * whoever grows into them.
 */
function OrderStrip({ t, suggestions, items }: {
  t: T; suggestions: ReorderSuggestion[]; items: StockItemRow[];
}) {
  const { lang } = useI18n();
  const toast = useToast();
  if (suggestions.length === 0) return null;

  /* Always in the unit they actually buy in — nobody orders "2400 grams of beans". */
  const amount = (s: ReorderSuggestion) =>
    s.suggestedPurchaseUnits != null && s.purchaseUnitLabel
      ? `${s.suggestedPurchaseUnits} × ${s.purchaseUnitLabel}`
      : `${qty(s.suggestedBase, s.baseUnit)} ${unitTag(s.baseUnit)}`;

  const estimate = suggestions.reduce((sum, s) => {
    const item = items.find((i) => i.id === s.stockItemId);
    return sum + (item ? s.suggestedBase * Number(item.costPerBaseUnit || 0) : 0);
  }, 0);

  const copy = async () => {
    const text = suggestions.map((s) => `• ${pick(s, 'name', lang)} — ${amount(s)}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast(t('copied'));
    } catch {
      toast(t('copyFailed'));
    }
  };

  return (
    <Strip t={t} tone="low"
      title={fill(t('orderTitle'), { n: suggestions.length })}
      summary={estimate > 0 ? fill(t('orderEst'), { v: omr(estimate) }) : undefined}
      action={<button className="stk-strip-act" onClick={copy}>{t('copyOrder')}</button>}>
      <ul className="stk-order-list">
        {suggestions.map((s) => (
          <li key={s.stockItemId}>
            <span>{pick(s, 'name', lang)}</span>
            <b className="num">{amount(s)}</b>
          </li>
        ))}
      </ul>
    </Strip>
  );
}

/* ================================================================== the room */

/**
 * The hero, and the signature drawn once at the scale of the whole stockroom.
 *
 * Everywhere else the gauge is one item. Here it is every item: a segment of track for
 * what has run out, what is below its line, and what is fine — and the rest of the track
 * left empty, because an item nobody has set a level for cannot honestly be coloured.
 * So the bar fills up as the shelf gets measured, and a café that has never swept sees an
 * almost empty track rather than a wall of reassuring green. It is the same object as the
 * row gauges below it, which is what makes the page one instrument instead of a dashboard.
 */
function RoomGauge({ t, items, out, low }: { t: T; items: StockItemRow[]; out: number; low: number }) {
  const total = items.length;
  const unset = items.filter((i) => levelOf(i) === 'unset').length;
  const ok = Math.max(0, total - unset - out - low);
  if (total === 0) return null;
  const pct = (n: number) => `${(n / total) * 100}%`;

  return (
    <div className="stk-room">
      <div className="stk-room-track" role="img"
        aria-label={fill(t('roomAria'), { n: total })}>
        <i data-tone="out" style={{ inlineSize: pct(out) }} />
        <i data-tone="low" style={{ inlineSize: pct(low) }} />
        <i data-tone="ok" style={{ inlineSize: pct(ok) }} />
      </div>
      {unset > 0 && (
        <p className="stk-room-note">{fill(t('unmeasured'), { n: unset, total })}</p>
      )}
    </div>
  );
}

/**
 * Read once, at the top: what the shelf is doing, what it is worth, and the three verbs.
 *
 * The four number tiles that used to live here were also the shelf's filters, which put
 * the same counts on screen twice and left two ways to do one thing. The counts moved to
 * the rail. What is left is a sentence, the room, and the day's work.
 */
function Situation({ t, overview, items, openSheet }: {
  t: T; overview?: StockOverview; items: StockItemRow[]; openSheet: (s: Sheet) => void;
}) {
  const clauses = overview ? ([
    { n: overview.outCount, label: t('clauseOut'), tone: 'out' },
    { n: overview.lowCount, label: t('clauseLow'), tone: 'low' },
    { n: overview.endingTodayCount, label: t('clauseSoon'), tone: 'soon' },
  ].filter((c) => c.n > 0)) : [];

  return (
    <header className="stk-head">
      <div className="stk-head-top">
        <div className="stk-head-main">
          <span className="stk-head-eyebrow">{t('situation')}</span>
          {!overview ? null : clauses.length === 0 ? (
            <div className="stk-head-clear">
              <b>{t('allClear')}</b>
              <span>{t('allClearSub')}</span>
            </div>
          ) : (
            <p className="stk-head-say">
              {clauses.map((c, idx) => (
                <span key={c.tone} data-tone={c.tone}>
                  {idx > 0 && <i aria-hidden>·</i>}
                  <b>{c.n}</b>{c.label}
                </span>
              ))}
            </p>
          )}
        </div>
        {overview && (
          <div className="stk-head-value">
            <b>{omr(overview.inventoryValue)}</b>
            <span>{t('onShelves')}</span>
          </div>
        )}
      </div>

      <RoomGauge t={t} items={items} out={overview?.outCount ?? 0} low={overview?.lowCount ?? 0} />

      {/* The sweep leads because it is the only one of the three that has to happen every
          day — the other two are events, and events log themselves when they occur. */}
      <div className="stk-do">
        <button className="key" onClick={() => openSheet({ k: 'sweep' })}>
          <span className="ic" aria-hidden>👁</span>{t('sweep')}
        </button>
        <button onClick={() => openSheet({ k: 'receive' })}>
          <span className="ic" aria-hidden>📦</span>{t('logDelivery')}
        </button>
        <button onClick={() => openSheet({ k: 'waste' })}>
          <span className="ic" aria-hidden>🗑</span>{t('logWaste')}
        </button>
      </div>
    </header>
  );
}

/* ================================================================== item panel */

/**
 * One item, everything about it, and every verb that applies to it. Tapping a row used to
 * open an edit form and tapping its number opened a correction — there was nowhere that
 * simply told you about a thing.
 */
function ItemPanel({ t, branchId, item, cover, openSheet, onClose }: {
  t: T; branchId?: number; item: StockItemRow; cover?: CoverRow;
  openSheet: (s: Sheet) => void; onClose: () => void;
}) {
  const { lang } = useI18n();
  const state = levelOf(item);
  const label = stateLabel(item, cover, t);

  const movesQ = useQuery({
    queryKey: ['stock', branchId ?? 'me', 'movements', item.id],
    queryFn: () => {
      const p = new URLSearchParams({ stockItemId: String(item.id) });
      if (branchId) p.set('branchId', String(branchId));
      return api.get<MovementRow[]>(`/api/dashboard/stock/movements?${p}`);
    },
  });
  const moves = (movesQ.data ?? []).slice(0, 6);

  const packCost = Number(item.costPerBaseUnit) * (Number(item.purchaseUnitSize) || 1);
  const go = (s: Sheet) => { onClose(); openSheet(s); };

  return (
    <Sheet title={pick(item, 'name', lang)} onClose={onClose}>
      <div className="stk-panel" data-state={state}>
        <div className="stk-panel-top">
          {/* The figure is the control. On-hand is live server state, not part of the item's
              definition, so it must never ride along in the Edit form's Save — you'd silently
              revert whatever sold while the form was open. Correcting it here writes a MANUAL
              movement to the ledger, which is what makes the number auditable. */}
          <button className="stk-panel-qty" onClick={() => go({ k: 'adjust', id: item.id })}>
            <b>{qty(item.onHand, item.baseUnit)}</b>
            <i>{item.baseUnit === 'PIECE' ? t('PIECE') : unitTag(item.baseUnit)}</i>
            <em>{t('recount')}</em>
          </button>
          <p className="stk-panel-note" data-tone={label.tone}>{label.text}</p>
        </div>
        {/* Clear of the figure's dashed rule, so the two horizontal lines don't read as one. */}
        <div style={{ marginBlock: '20px 16px' }}><Gauge item={item} /></div>
      </div>

      <div className="stk-facts">
        <div className="stk-fact">
          <span>{t('daysCover')}</span>
          <b>{cover?.daysLeft != null ? `${Math.round(cover.daysLeft)} ${t('days')}` : '—'}</b>
        </div>
        <div className="stk-fact">
          <span>{t('perDay')}</span>
          <b>{cover?.dailyUsage != null ? `${qty(cover.dailyUsage, item.baseUnit)} ${unitTag(item.baseUnit)}` : '—'}</b>
        </div>
        <div className="stk-fact">
          <span>{t('costPack')}</span>
          <b>{packCost > 0 ? omr(packCost) : '—'}</b>
        </div>
        <div className="stk-fact">
          <span>{t('reorderAt')}</span>
          <b className={item.reorderPoint == null ? 'soft' : ''}>
            {item.reorderPoint == null ? t('notSet') : `${qty(item.reorderPoint, item.baseUnit)} ${unitTag(item.baseUnit)}`}
          </b>
        </div>
      </div>

      <div className="stk-panel-acts">
        <button className="key" onClick={() => go({ k: 'receive', itemId: item.id })}>{t('logDelivery')}</button>
        <button onClick={() => go({ k: 'waste', itemId: item.id })}>{t('logWaste')}</button>
        <button onClick={() => go({ k: 'edit', id: item.id })}>{t('edit')}</button>
      </div>

      <div>
        <h5 className="stk-sec-h" style={{ marginBlockEnd: 6 }}>{t('recent')}</h5>
        {moves.length === 0 ? (
          <p className="stk-hint">{t('noMovements')}</p>
        ) : (
          <div className="stk-moves">
            {moves.map((m) => <MoveLine key={m.id} m={m} t={t} unit={item.baseUnit} />)}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function MoveLine({ m, t, unit, name }: { m: MovementRow; t: T; unit?: BaseUnit | null; name?: string }) {
  const u = unit ?? m.baseUnit;
  const down = m.deltaBase < 0;
  return (
    <div className="stk-move">
      <span className="stk-move-what">
        <span className="stk-move-tag" data-r={m.reason}>{t(m.reason)}</span>
        {name ?? (m.wasteReason ? t(m.wasteReason) : m.note || '')}
      </span>
      <span className="stk-move-when">
        {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        {name && m.wasteReason ? ` · ${t(m.wasteReason)}` : ''}
      </span>
      <span className={'stk-move-delta' + (down ? ' down' : '')}>
        <b>{m.deltaBase > 0 ? '+' : ''}{qty(m.deltaBase, u)}</b>
        <small>→ {qty(m.balanceAfter, u)} {unitTag(u)}</small>
      </span>
    </div>
  );
}

/* ================================================================== sheets */

function Sheet({ title, onClose, children, onSubmit, submitLabel, busy }: {
  title: string; onClose: () => void; children: React.ReactNode;
  onSubmit?: () => void; submitLabel?: string; busy?: boolean;
}) {
  /* One handler here covers every sheet on the page — delivery, waste, recount, editor. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-bg stk-modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card stk-sheet stock-page" role="dialog" aria-modal="true" aria-label={title}>
        <div className="stk-sheet-hd">
          <h3>{title}</h3>
          <button className="x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="stk-sheet-body">{children}</div>
        {onSubmit && (
          <div className="stk-sheet-ft">
            <button className="btn ghost" onClick={onClose}>✕</button>
            <button className="btn" onClick={onSubmit} disabled={busy}>{submitLabel}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Bulk delivery entry. Quantities are typed in the unit the café buys in, then converted. */
function ReceiveSheet({ t, branchId, items, queryKey, initialItemId, onClose }: {
  t: T; branchId?: number; items: StockItemRow[];
  queryKey: unknown[]; initialItemId?: number; onClose: () => void;
}) {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  /* Deliveries don't always match the pack you configured — the item might say "1 kg" but
     today a 500 g bag turned up. Each line can therefore be entered either in packs or
     directly in the counting unit, so nobody has to work out that 500 g is "0.5 packs". */
  type Mode = 'pack' | 'base';
  const [lines, setLines] = useState<{ stockItemId: number; packs: string; unitCost: string; mode: Mode }[]>([
    { stockItemId: initialItemId ?? items[0]?.id ?? 0, packs: '', unitCost: '', mode: 'pack' },
  ]);
  const sizeOf = (item?: StockItemRow) => (item && item.purchaseUnitSize > 0 ? item.purchaseUnitSize : 1);
  const patch = (idx: number, p: Partial<(typeof lines)[number]>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...p } : l)));

  const save = useMutation({
    mutationFn: () => {
      const payload = lines
        .filter((l) => l.stockItemId && Number(l.packs) > 0)
        .map((l) => {
          const item = items.find((i) => i.id === l.stockItemId)!;
          // in base mode the number already IS the counting unit, so nothing to multiply
          const factor = l.mode === 'pack' ? sizeOf(item) : 1;
          return {
            stockItemId: l.stockItemId,
            quantityBase: Number(l.packs) * factor,
            // The café types what a pack cost; the ledger stores cost per base unit.
            unitCost: l.unitCost ? Number(l.unitCost) / factor : null,
          };
        });
      return api.post('/api/dashboard/stock/receive', { branchId, lines: payload });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey }); toast(t('saved')); onClose(); },
    onError: (e: Error) => toast(e.message),
  });

  return (
    <Sheet title={t('logDelivery')} onClose={onClose} onSubmit={() => save.mutate()}
      submitLabel={t('record')} busy={save.isPending}>
      {lines.map((line, idx) => {
        const item = items.find((i) => i.id === line.stockItemId);
        const landed = Number(line.packs) * (line.mode === 'pack' ? sizeOf(item) : 1);
        return (
          <div className="stk-line card" key={idx}>
            {lines.length > 1 && (
              <button className="x" aria-label="remove"
                onClick={() => setLines((p) => p.filter((_, i) => i !== idx))}>✕</button>
            )}
            <select value={line.stockItemId} aria-label={t('items')}
              onChange={(e) => patch(idx, { stockItemId: Number(e.target.value) })}>
              {items.map((i) => <option key={i.id} value={i.id}>{pick(i, 'name', lang)}</option>)}
            </select>
            <div className="pair">
              <label>
                <span>
                  {line.mode === 'pack' ? (item?.purchaseUnitLabel || t('packs')) : t(item?.baseUnit ?? 'G')}
                  {/* Swap the line between "2 bags" and "500 g" — a delivery that doesn't
                      match the configured pack shouldn't need mental arithmetic. */}
                  <button type="button" className="stk-unit-swap"
                    onClick={() => patch(idx, { mode: line.mode === 'pack' ? 'base' : 'pack', packs: '', unitCost: '' })}>
                    {line.mode === 'pack'
                      ? fill(t('enterInUnit'), { u: t(item?.baseUnit ?? 'G') })
                      : t('enterInPacks')}
                  </button>
                </span>
                <input type="number" inputMode="decimal" min="0" step="0.01" value={line.packs}
                  onChange={(e) => patch(idx, { packs: e.target.value })} />
              </label>
              <label>
                <span>{line.mode === 'pack'
                  ? `${t('costPer')} ${item?.purchaseUnitLabel || t('pack1')}`
                  : `${t('costPer')} ${t(item?.baseUnit ?? 'G')}`}</span>
                <input type="number" inputMode="decimal" min="0" step="0.001" value={line.unitCost}
                  onChange={(e) => patch(idx, { unitCost: e.target.value })} />
              </label>
            </div>
            {/* Always show what lands on the shelf, so a wrong pack size is caught here
                rather than discovered at the next stocktake. */}
            {landed > 0 && (
              <p className="stk-spec-sum">
                <span><b>{qty(landed, item?.baseUnit)} {item?.baseUnit === 'PIECE' ? t('PIECE') : unitTag(item?.baseUnit)}</b> {t('lands')}</span>
              </p>
            )}
          </div>
        );
      })}
      <button className="stk-mini"
        onClick={() => setLines((p) => [...p, { stockItemId: items[0]?.id ?? 0, packs: '', unitCost: '', mode: 'pack' }])}>
        + {t('addLine')}
      </button>
    </Sheet>
  );
}

/**
 * Waste with a reason, not a free-text note. Staff meals and comps are a large hidden cost
 * bucket and the report is only actionable if they are separable from spoilage.
 */
function WasteSheet({ t, branchId, items, queryKey, initialItemId, onClose }: {
  t: T; branchId?: number; items: StockItemRow[];
  queryKey: unknown[]; initialItemId?: number; onClose: () => void;
}) {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [stockItemId, setStockItemId] = useState(initialItemId ?? items[0]?.id ?? 0);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState<WasteReason>('SPILLED');
  const [note, setNote] = useState('');

  const item = items.find((i) => i.id === stockItemId);
  const save = useMutation({
    mutationFn: () => api.post('/api/dashboard/stock/waste', {
      branchId, stockItemId, quantityBase: Number(amount), reason, note: note || null,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey }); toast(t('saved')); onClose(); },
    onError: (e: Error) => toast(e.message),
  });

  return (
    <Sheet title={t('logWaste')} onClose={onClose} onSubmit={() => save.mutate()}
      submitLabel={t('record')} busy={save.isPending}>
      <label className="stk-f">
        <span>{t('items')}</span>
        <select value={stockItemId} onChange={(e) => setStockItemId(Number(e.target.value))}>
          {items.map((i) => <option key={i.id} value={i.id}>{pick(i, 'name', lang)}</option>)}
        </select>
      </label>
      <label className="stk-f">
        <span>{t('quantity')} ({item ? t(item.baseUnit) : ''})</span>
        <input type="number" inputMode="decimal" min="0" step="0.1" value={amount}
          onChange={(e) => setAmount(e.target.value)} autoFocus />
      </label>
      <div className="stk-f">
        <span>{t('reason')}</span>
        <div className="stk-chips" role="group" aria-label={t('reason')}>
          {WASTE_REASONS.map((r) => (
            <button key={r} type="button" aria-pressed={reason === r}
              className={reason === r ? 'on' : ''} onClick={() => setReason(r)}>{t(r)}</button>
          ))}
        </div>
      </div>
      <label className="stk-f">
        <span>{t('note')}</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
    </Sheet>
  );
}

/** "The shelf says 820 g." Sets on-hand outright; the ledger records the difference. */
function AdjustSheet({ t, branchId, queryKey, item, onClose }: {
  t: T; branchId?: number; queryKey: unknown[]; item: StockItemRow; onClose: () => void;
}) {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [value, setValue] = useState(String(item.onHand));
  const [note, setNote] = useState('');

  const save = useMutation({
    mutationFn: () => api.post('/api/dashboard/stock/adjust', {
      branchId, stockItemId: item.id, quantityBase: Number(value), note: note || null,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey }); toast(t('saved')); onClose(); },
    onError: (e: Error) => toast(e.message),
  });

  const diff = Number(value) - item.onHand;
  return (
    <Sheet title={`${t('recount')} · ${pick(item, 'name', lang)}`} onClose={onClose}
      onSubmit={() => save.mutate()} submitLabel={t('save')} busy={save.isPending}>
      <label className="stk-f big">
        <span>{t('onHand')} ({t(item.baseUnit)})</span>
        <input type="number" inputMode="decimal" step="0.1" value={value}
          onChange={(e) => setValue(e.target.value)} autoFocus />
      </label>
      {/* Says why this exists at all: sales already draw stock down, so anyone opening this
          is here because the shelf and the system disagree. */}
      <p className="stk-hint">{t('recountHint')}</p>
      {Math.abs(diff) > 0.001 && (
        <p className="stk-spec-sum">
          <span>{t('diff')} <b>{diff > 0 ? '+' : ''}{qty(diff, item.baseUnit)} {unitTag(item.baseUnit)}</b></span>
        </p>
      )}
      <label className="stk-f"><span>{t('note')}</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} /></label>
    </Sheet>
  );
}

/* ================================================================== item editor */

/**
 * The unit model — counted in grams, bought as a 1 kg bag, costed per gram — was four
 * disconnected labelled fields, and it was the single thing nobody understood. It is now
 * one sentence you fill in, with what it adds up to shown live underneath.
 */
function ItemEditor({ t, branchId, queryKey, item, onClose }: {
  t: T; branchId?: number; queryKey: unknown[];
  item: StockItemRow | null; onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { lang } = useI18n();
  const [f, setF] = useState<StockItemPayload & { parLevel: string; reorderPoint: string }>({
    nameEn: item?.nameEn ?? '', nameAr: item?.nameAr ?? '',
    kind: item?.kind ?? 'INGREDIENT', baseUnit: item?.baseUnit ?? 'G',
    purchaseUnitLabel: item?.purchaseUnitLabel ?? '', purchaseUnitSize: item?.purchaseUnitSize ?? 1,
    costPerBaseUnit: item?.costPerBaseUnit ?? 0, wastePct: item?.wastePct ?? 0,
    batchYieldBase: item?.batchYieldBase ?? null, category: item?.category ?? '',
    servingsPerPack: item?.servingsPerPack ?? null,
    countFrequency: item?.countFrequency ?? null, allergens: item?.allergens ?? [],
    supplierId: item?.supplierId ?? null,
    parLevel: item?.parLevel != null ? String(item.parLevel) : '',
    reorderPoint: item?.reorderPoint != null ? String(item.reorderPoint) : '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  /* Cafés buy grams by the kilo and millilitres by the litre, so switching the counting
     unit should carry the obvious purchase unit with it. Only applied while the owner
     hasn't written their own label — never overwrite something they typed. */
  const onUnitChange = (u: BaseUnit) => setF((p) => {
    const auto = !p.purchaseUnitLabel?.trim()
      || Object.values(UNIT_DEFAULTS).some((d) => d.label === p.purchaseUnitLabel?.trim());
    return auto
      ? { ...p, baseUnit: u, purchaseUnitLabel: UNIT_DEFAULTS[u].label, purchaseUnitSize: UNIT_DEFAULTS[u].size }
      : { ...p, baseUnit: u };
  });

  const size = Number(f.purchaseUnitSize) || 1;
  const perBase = Number(f.costPerBaseUnit) || 0;
  /* The sentence asks for the pack price, because that is what the invoice says. The API
     wants cost per base unit, so the two are kept in step here rather than in anyone's head. */
  const [packCost, setPackCost] = useState<string>(perBase > 0 ? (perBase * size).toFixed(3) : '');
  const onPackCost = (v: string) => {
    setPackCost(v);
    const n = Number(v);
    set('costPerBaseUnit', Number.isFinite(n) && size > 0 ? n / size : 0);
  };
  const unitWord = t(f.baseUnit);
  const packWord = f.purchaseUnitLabel?.trim() || t('pack1');
  const servingsPerPack = Number(f.servingsPerPack) || 0;

  const save = useMutation({
    mutationFn: async () => {
      const body: StockItemPayload = {
        nameEn: f.nameEn.trim(), nameAr: (f.nameAr || f.nameEn).trim(), kind: f.kind, baseUnit: f.baseUnit,
        purchaseUnitLabel: f.purchaseUnitLabel || null,
        purchaseUnitSize: size,
        costPerBaseUnit: Number(f.costPerBaseUnit) || 0,
        wastePct: Number(f.wastePct) || 0,
        batchYieldBase: f.kind === 'PREP' ? Number(f.batchYieldBase) || 1 : null,
        servingsPerPack: Number(f.servingsPerPack) > 0 ? Number(f.servingsPerPack) : null,
        category: f.category || null, countFrequency: f.countFrequency ?? null,
        allergens: f.allergens ?? [], supplierId: f.supplierId ?? null,
      };
      const saved = item
        ? await api.patch<StockItemRow>(`/api/dashboard/stock/items/${item.id}`, body)
        : await api.post<StockItemRow>('/api/dashboard/stock/items', body);
      // Par and reorder point live per branch, so they save as a second call against the level.
      await api.patch(`/api/dashboard/stock/items/${saved.id}/levels`, {
        branchId,
        parLevelBase: f.parLevel === '' ? null : Number(f.parLevel),
        reorderPointBase: f.reorderPoint === '' ? null : Number(f.reorderPoint),
      });
      return saved;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey }); toast(t('saved')); onClose(); },
    onError: (e: Error) => toast(e.message),
  });

  /* Every other mutation on this page reports what happened; this one used to fail in
     silence, so a refused archive was indistinguishable from a dead button. */
  const archive = useMutation({
    mutationFn: () => api.del(`/api/dashboard/stock/items/${item!.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey }); toast(t('archived')); onClose(); },
    onError: (e: Error) => toast(e.message),
  });

  return (
    <Sheet title={item ? f.nameEn || f.nameAr : t('addItem')} onClose={onClose}
      onSubmit={() => save.mutate()} submitLabel={t('save')} busy={save.isPending}>
      <div className="stk-grid">
        <label className="stk-f"><span>{t('nameEn')}</span>
          <input value={f.nameEn} onChange={(e) => set('nameEn', e.target.value)} autoFocus={!item} /></label>
        <label className="stk-f"><span>{t('nameAr')}</span>
          <input dir="rtl" value={f.nameAr} placeholder={f.nameEn}
            onChange={(e) => set('nameAr', e.target.value)} /></label>
        {/* "Kind of thing" (INGREDIENT / GOOD / PREP) is gone. It asked the owner to
            classify their stock before they had a reason to care, and nothing on this
            screen behaves differently for the answer. New items are INGREDIENT; the
            column still exists for anything already classified. */}
        <label className="stk-f"><span>{t('category')}</span>
          <input value={f.category ?? ''} placeholder={t('categoryEg')}
            onChange={(e) => set('category', e.target.value)} /></label>
      </div>

      {/* The spec sentence. Read it out loud and it is exactly what the owner would say. */}
      <div className="stk-spec">
        {t('specCount1')}{' '}
        <select value={f.baseUnit} aria-label={t('specCount1')}
          onChange={(e) => onUnitChange(e.target.value as BaseUnit)}>
          {(['G', 'ML', 'PIECE'] as BaseUnit[]).map((u) => <option key={u} value={u}>{t(u)}</option>)}
        </select>
        {', '}{t('specBuy1')}{' '}
        <input className="w-txt" value={f.purchaseUnitLabel ?? ''} aria-label={t('specBuy1')}
          placeholder={UNIT_DEFAULTS[f.baseUnit].label}
          onChange={(e) => set('purchaseUnitLabel', e.target.value)} />
        {' '}{t('specBuy2')}{' '}
        <NumField className="w-num" value={f.purchaseUnitSize ?? 1} aria-label={t('specBuy2')}
          onValue={(n) => set('purchaseUnitSize', n ?? 1)} />
        {' '}{unitWord}{' '}{t('specBuy3')}{' '}
        <input className="w-cost" type="number" inputMode="decimal" min="0" step="0.001"
          value={packCost} aria-label={t('specBuy3')} onChange={(e) => onPackCost(e.target.value)} />
        {' '}{t('specCurrency')}.
        <div className="stk-spec-sum">
          {perBase > 0
            ? <>
              {/* "0.0085 per gram" — singular, because it is the price of exactly one. */}
              <span>{fill(t('specPerBase'), { c: perBase.toFixed(6).replace(/0+$/, ''), u: t(`${f.baseUnit}1`) })}</span>
              <span>{fill(t('specPerPack'), { c: omr(perBase * size), p: packWord })}</span>
            </>
            : <span>{t('specFillHint')}</span>}
        </div>
      </div>

      {/* The yield. One sentence, one number, and it is the number that makes cup cost
          possible without anyone typing a gram: a recipe line is just this said backwards
          (1 kg ÷ 55 drinks = 18.2 g). Asked here because the pack is already on screen —
          "how far does this bag go" only makes sense next to what the bag is. */}
      <div className="stk-spec">
        {fill(t('yield1'), { p: packWord })}{' '}
        <NumField className="w-num" value={f.servingsPerPack ?? null} aria-label={t('yieldAria')}
          onValue={(n) => set('servingsPerPack', n)} />
        {' '}{t('yield2')}
        <div className="stk-spec-sum">
          {servingsPerPack > 0 && size > 0
            ? <>
              <span>{fill(t('yieldPer'), {
                q: qty(size / servingsPerPack, f.baseUnit), u: unitTag(f.baseUnit) || t(`${f.baseUnit}1`),
              })}</span>
              {perBase > 0 && (
                <span className="stk-yield-cost">
                  {fill(t('yieldCost'), { c: omr((perBase * size) / servingsPerPack) })}
                </span>
              )}
            </>
            : <span>{t('yieldHint')}</span>}
        </div>
      </div>

      {/* Reorder point, par level, expected loss %, count frequency and allergens are all
          gone from this form. Every one of them was a number the owner had to invent
          before the feature would do anything, and the two that actually matter — the
          full shelf and the warning line — the sweep now asks for at the shelf, where
          they can be answered by looking. */}
      <p className="stk-hint">{t('levelsBySweep')}</p>

      {item && (
        <div>
          <button className="btn sm danger" onClick={async () => {
            /* The dialog used to be a title and nothing else, which left "archive" to mean
               whatever the reader feared. Say what actually happens: the item goes, the
               ledger and any recipe using it do not. */
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
