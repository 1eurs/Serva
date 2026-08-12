import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion, type Variants } from 'motion/react';
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useSkin } from '../../lib/skin';
import { useI18n, useT, type Dict } from '../../lib/i18n';
import { omr, omanDate, omanHour } from '../../lib/format';
import { isPlanRequiredError, isProPlan } from '../../lib/plan';
import type { Restaurant, BranchResponse, PageResponse } from '../../lib/types';
import './analytics.css';

/* ---- API shapes ---- */
interface BestItem { menuItemId: number; nameEn: string; nameAr: string; totalQuantity: number; totalRevenue: string }
interface HourlyCount { hour: number; orders: number }
interface Summary {
  from: string; to: string;
  totalOrders: number; pendingOrders: number; acceptedOrders: number; declinedOrders: number;
  preparingOrders: number; readyOrders: number; completedOrders: number; cancelledOrders: number;
  totalRevenue: string; averageOrderValue: string;
  bestSellingItems: BestItem[]; busiestHours: HourlyCount[];
}
interface DailyPoint { date: string; orders: number; revenue: string }
interface Conversion { menuItemId: number; nameEn: string; nameAr: string; views: number; orders: number; conversionRate: string }
interface Affinity { itemAId: number; aNameEn: string; aNameAr: string; itemBId: number; bNameEn: string; bNameAr: string; coOrders: number }
interface Staff { actorUserId: number; actorName: string; accepted: number; declined: number; completed: number; avgAcceptSeconds: number | null }
interface ForecastSlot { dayOfWeek: number; hour: number; expectedOrders: number }
interface CustomerInsight { profileId: number; name: string; phone: string; orderCount: number; lastOrderAt: string | null }
interface Customers { topRegulars: CustomerInsight[]; atRisk: CustomerInsight[] }
interface CustomerBase {
  totalCustomers: number; repeatCustomers: number; repeatRatePercent: number;
  avgOrdersPerCustomer: number; newCustomers: number; activeCustomers: number; repeatOrderSharePercent: number;
}
interface CustomerDirectoryRow { phone: string; name: string; orderCount: number; lastOrderAt: string | null }
interface PaymentMethodRevenue { method: 'CASH' | 'CARD'; paymentCount: number; revenue: string }
interface Benchmark {
  yourAov: string; medianAov: string; aovPercentile: number;
  yourAcceptSeconds: number | null; medianAcceptSeconds: number | null; acceptPercentile: number;
  comparableCafes: number;
}
interface Funnel { menuViews: number; addedToCart: number; checkoutStarted: number; ordersPlaced: number }
interface DaypartPoint { daypart: string; orders: number; revenue: string }
interface KitchenTiming {
  acceptSeconds: number | null; prepSeconds: number | null; handoffSeconds: number | null;
  toReadySeconds: number | null; toCompleteSeconds: number | null; sampleOrders: number;
}

type Range = 'today' | '7d' | '30d' | '90d' | 'custom';
type Section = 'overview' | 'menu' | 'team' | 'customers';
/** The figure the primary chart plots. All three come off a DailyPoint. */
type Metric = 'revenue' | 'orders' | 'aov';
type T = (k: string) => string;

const DICT: Dict = {
  ar: {
    a_today: 'اليوم', a_7d: '٧ أيام', a_30d: '٣٠ يوم', a_90d: '٩٠ يوم', a_custom: 'مخصّص', a_pro: 'برو',
    a_orders: 'طلبات', a_revenue: 'الإيرادات', a_aov: 'متوسط الطلب',
    a_avgShort: 'المتوسط', a_doneShort: 'مكتمل',
    a_comparedWith: 'مقارنة بـ {d}', a_new: 'جديد',
    a_byHour: 'بالساعة', a_byDay: 'باليوم',
    a_busiest: 'أكثر الساعات ازدحامًا', a_bestsellers: 'الأكثر مبيعًا',
    a_status: 'حالة الطلبات', a_pending: 'معلّقة', a_accepted: 'مقبولة', a_preparing: 'تُحضَّر', a_inprogress: 'قيد التنفيذ',
    a_ready: 'جاهزة', a_completed: 'مكتملة', a_cancelled: 'ملغاة', a_declined: 'مرفوضة',
    a_noOrders: 'لا توجد طلبات بعد — ستظهر هنا فور وصولها.',
    a_noData: 'لا توجد بيانات لهذه الفترة.', a_retry: 'حاول مرة أخرى',
    a_secOverview: 'نظرة عامة', a_secMenu: 'القائمة', a_secTeam: 'الفريق', a_secCustomers: 'العملاء',
    a_secService: 'الخدمة', a_secItems: 'الأصناف',
    a_lockTitle: 'افتح تحليلات برو', a_lockCta: 'الترقية إلى برو',
    a_lockRange: 'استعلم حتى ٩٠ يومًا من السجل وافتح طبقة التحليلات التشخيصية.',
    a_lockMenu: 'اعرف أي الأصناف تُشاهَد كثيرًا وتُطلب قليلًا، وما الذي يُطلب معًا.',
    a_lockTeam: 'تابِع سرعة القبول وإنتاجية كل عضو في الفريق.',
    a_lockCustomers: 'اكتشف عملاءك الدائمين واستعِد من بدأوا يبتعدون.',
    a_conv: 'تحويل الأصناف', a_convSub: 'مشاهدة ← طلب', a_views: 'مشاهدة', a_low: 'ضعيف',
    a_funnel: 'مسار التحويل', a_fn_sub: 'من المشاهدة إلى الطلب',
    a_fn_views: 'مشاهدات القائمة', a_fn_cart: 'أُضيف للسلة', a_fn_checkout: 'بدء الدفع', a_fn_orders: 'تم الطلب',
    a_basket: 'يُطلبان معًا', a_together: '×',
    a_basketHint: 'تظهر الأزواج التي تكررت في طلبين مختلفين على الأقل.',
    a_staff: 'أداء الفريق', a_avgAccept: 'متوسط القبول',
    a_forecast: 'إيقاع الأسبوع', a_expected: 'متوقّع', a_rhythmHint: 'متوسط الطلبات لكل ساعة · آخر ٤ أسابيع',
    a_customers: 'العملاء', a_regulars: 'الأكثر ولاءً', a_atrisk: 'بدأوا يبتعدون', a_ordersN: 'طلبات', a_daysN: 'يوم', a_never: '—',
    a_allCustomers: 'عرض كل العملاء', a_customerDirectory: 'دليل العملاء', a_backInsights: 'العودة إلى تحليلات العملاء',
    a_searchCustomers: 'ابحث بالاسم أو رقم الهاتف', a_search: 'بحث', a_name: 'الاسم', a_phone: 'رقم الهاتف', a_lastOrder: 'آخر طلب',
    a_paymentSplit: 'الإيرادات حسب الدفع', a_paymentHint: 'حسب طريقة الدفع المسجّلة عند التحصيل.', a_cash: 'نقداً', a_card: 'بطاقة / فيزا', a_transactions: 'دفعات',
    a_cbase: 'قاعدة العملاء', a_cb_repeat: 'نسبة العائدين', a_cb_repeatSub: '{r} من {n} عميلًا يعيدون الطلب',
    a_cb_avg: 'طلبات/عميل', a_cb_new: 'جدد هذا الشهر', a_cb_active: 'نشطون (٣٠ يومًا)', a_cb_repeatShare: 'حصة الطلبات المتكررة',
    a_cb_newOrders: 'أوائل', a_cb_returningOrders: 'متكررة',
    a_benchmark: 'مقارنة مرجعية', a_you: 'مطعمك', a_median: 'الوسيط', a_percentile: 'المئين', a_vsCafes: 'مقابل {n} مطعمًا',
    a_daypart: 'حسب وقت اليوم',
    a_dp_morning: 'الصباح', a_dp_midday: 'الظهيرة', a_dp_afternoon: 'العصر', a_dp_evening: 'المساء', a_dp_late: 'وقت متأخر',
    a_kitchen: 'توقيت المطبخ', a_kt_accept: 'حتى القبول', a_kt_prep: 'التحضير', a_kt_handoff: 'التسليم',
    a_kt_toReady: 'حتى الجاهزية', a_kt_total: 'الإجمالي', a_kt_bottleneck: 'أبطأ خطوة', a_kt_sample: 'عبر {n} طلبًا', a_min: 'د',
    a_sec: 'ث',
    a_item: 'الصنف', a_qty: 'الكمية', a_share: 'الحصة', a_member: 'العضو', a_done: 'مكتمل', a_rate: 'النسبة',
    a_allBranches: 'كل الفروع',
    a_tagPeak: 'الذروة', a_tagTop: 'الأعلى', a_tagWeak: 'ضعيف', a_tagQuiet: 'هدوء',
    a_insBusiest: '{h} هي أكثر ساعاتك ازدحامًا', a_insTop: '{name} يمثل {p}٪ من الإيرادات',
    a_insWeak: '{name} يحصل على مشاهدات بطلبات قليلة', a_insRisk: '{n} من عملائك الدائمين بدأوا يبتعدون',
    a_insBench: 'متوسط طلبك يتفوق على {p}٪ من المطاعم',
  },
  en: {
    a_today: 'Today', a_7d: '7 days', a_30d: '30 days', a_90d: '90 days', a_custom: 'Custom', a_pro: 'Pro',
    a_orders: 'Orders', a_revenue: 'Revenue', a_aov: 'Avg order',
    a_avgShort: 'avg', a_doneShort: 'done',
    a_comparedWith: 'compared with {d}', a_new: 'new',
    a_byHour: 'by hour', a_byDay: 'by day',
    a_busiest: 'Busiest hours', a_bestsellers: 'Best sellers',
    a_status: 'Order status', a_pending: 'Pending', a_accepted: 'Accepted', a_preparing: 'Preparing', a_inprogress: 'In progress',
    a_ready: 'Ready', a_completed: 'Completed', a_cancelled: 'Cancelled', a_declined: 'Declined',
    a_noOrders: "No orders yet — they'll appear here as they come in.",
    a_noData: 'No data for this period.', a_retry: 'Try again',
    a_secOverview: 'Overview', a_secMenu: 'Menu', a_secTeam: 'Team', a_secCustomers: 'Customers',
    a_secService: 'Service', a_secItems: 'Items',
    a_lockTitle: 'Unlock Pro analytics', a_lockCta: 'Upgrade to Pro',
    a_lockRange: 'Query up to 90 days of history and unlock the diagnostic layer.',
    a_lockMenu: 'See which items get views but few orders, and what sells together.',
    a_lockTeam: 'Track accept times and throughput for each team member.',
    a_lockCustomers: 'Spot your regulars and win back customers going quiet.',
    a_conv: 'Item conversion', a_convSub: 'view → order', a_views: 'Views', a_low: 'low',
    a_funnel: 'Conversion funnel', a_fn_sub: 'menu view → order',
    a_fn_views: 'Menu views', a_fn_cart: 'Added to cart', a_fn_checkout: 'Checkout started', a_fn_orders: 'Order placed',
    a_basket: 'Ordered together', a_together: '×',
    a_basketHint: 'Pairs that repeated across at least 2 orders show up here.',
    a_staff: 'Staff performance', a_avgAccept: 'Avg accept',
    a_forecast: 'Weekly rhythm', a_expected: 'expected', a_rhythmHint: 'avg orders per hour · last 4 weeks',
    a_customers: 'Customers', a_regulars: 'Top regulars', a_atrisk: 'Going quiet', a_ordersN: 'orders', a_daysN: 'days', a_never: '—',
    a_allCustomers: 'View all customers', a_customerDirectory: 'Customer directory', a_backInsights: 'Back to customer insights',
    a_searchCustomers: 'Search name or phone number', a_search: 'Search', a_name: 'Name', a_phone: 'Phone number', a_lastOrder: 'Last order',
    a_paymentSplit: 'Revenue by payment', a_paymentHint: 'Based on the payment method recorded at collection.', a_cash: 'Cash', a_card: 'Card / Visa', a_transactions: 'payments',
    a_cbase: 'Customer base', a_cb_repeat: 'Repeat rate', a_cb_repeatSub: '{r} of {n} customers reorder',
    a_cb_avg: 'Orders/customer', a_cb_new: 'New this month', a_cb_active: 'Active (30d)', a_cb_repeatShare: 'Repeat-order share',
    a_cb_newOrders: 'First-time', a_cb_returningOrders: 'Repeat',
    a_benchmark: 'Benchmark', a_you: 'You', a_median: 'Median', a_percentile: 'percentile', a_vsCafes: 'vs {n} cafés',
    a_daypart: 'By time of day',
    a_dp_morning: 'Morning', a_dp_midday: 'Midday', a_dp_afternoon: 'Afternoon', a_dp_evening: 'Evening', a_dp_late: 'Late night',
    a_kitchen: 'Kitchen timing', a_kt_accept: 'To accept', a_kt_prep: 'Prep', a_kt_handoff: 'Handoff',
    a_kt_toReady: 'To ready', a_kt_total: 'Total', a_kt_bottleneck: 'Slowest step', a_kt_sample: 'across {n} orders', a_min: 'm',
    a_sec: 's',
    a_item: 'Item', a_qty: 'Qty', a_share: 'Share', a_member: 'Member', a_done: 'Done', a_rate: 'Rate',
    a_allBranches: 'All branches',
    a_tagPeak: 'Peak', a_tagTop: 'Top', a_tagWeak: 'Weak', a_tagQuiet: 'Quiet',
    a_insBusiest: '{h} is your busiest hour', a_insTop: '{name} is {p}% of revenue',
    a_insWeak: '{name} gets views but few orders', a_insRisk: '{n} regulars have gone quiet',
    a_insBench: 'Your avg order beats {p}% of cafés',
  },
};

const DAY = 86_400_000;

/* Minimum views before we'll call an item a weak seller. At the old threshold of 5 a
   single quiet afternoon was enough to name-and-shame an item, which is worse than
   saying nothing — the owner acts on it and the advice turns out to be noise. */
const MIN_VIEWS_FOR_WEAK = 20;

const hourLabel = (h: number) => { const am = h < 12; const v = h % 12 === 0 ? 12 : h % 12; return `${v}${am ? 'am' : 'pm'}`; };
const WEEK_AR = ['', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];
const WEEK_EN = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dowIndex = (iso: string) => { const d = new Date(iso + 'T00:00:00').getDay(); return d === 0 ? 7 : d; };
const fmtDate = (iso: string, lang: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB', opts).format(new Date(iso + 'T00:00:00'));
const ymd = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** Every ISO date in a window, so a day the API omitted (no orders) still gets a point. */
const dayList = (fromIso: string, n: number) => {
  const t0 = new Date(fromIso + 'T00:00:00').getTime();
  return Array.from({ length: n }, (_, i) => ymd(t0 + i * DAY));
};

/* staggered reveal for lists that read top-to-bottom */
const listV: Variants = { show: { transition: { staggerChildren: 0.06, delayChildren: 0.03 } } };
const itemV: Variants = { hidden: { opacity: 0, y: 5 }, show: { opacity: 1, y: 0 } };

/* =====================================================================
   Chart palette.

   Recharts writes stroke/fill as SVG presentation attributes, where a
   var() reference does not resolve — so the palette has to be read off
   the DOM rather than declared in CSS, and re-read whenever the skin
   flips. This replaces three hardcoded hexes that were emerald under the
   pro skin, whose primary is zinc-900 and whose surfaces are neutral.
   ===================================================================== */
const CHART_TOKENS = ['--accent-text', '--lime', '--faint', '--muted', '--line-2', '--bg-2'] as const;
type ChartTokens = Record<(typeof CHART_TOKENS)[number], string>;
const CHART_FALLBACK: ChartTokens = {
  '--accent-text': '#047857', '--lime': '#10b981', '--faint': '#8A938B',
  '--muted': '#566058', '--line-2': 'rgba(21,24,28,.42)', '--bg-2': '#FFFFFF',
};
function useChartTokens(ref: RefObject<HTMLElement | null>): ChartTokens {
  const { skin } = useSkin();
  const [tok, setTok] = useState<ChartTokens>(CHART_FALLBACK);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const next = { ...CHART_FALLBACK };
    for (const k of CHART_TOKENS) {
      const v = cs.getPropertyValue(k).trim();
      if (v) next[k] = v;
    }
    setTok(next);
  }, [ref, skin]);
  return tok;
}

/* up/down/flat/new delta vs a comparable previous period */
interface Delta { dir: 'up' | 'down' | 'flat' | 'new' | 'none'; pct: number; abs: number }
function delta(now: number, prev: number | null | undefined): Delta {
  if (prev == null) return { dir: 'none', pct: 0, abs: 0 };
  const abs = now - prev;
  if (prev === 0) return { dir: now > 0 ? 'new' : 'flat', pct: 0, abs };
  const change = (abs / prev) * 100;
  if (Math.abs(change) < 0.5) return { dir: 'flat', pct: 0, abs };
  return { dir: change > 0 ? 'up' : 'down', pct: Math.abs(Math.round(change)), abs };
}

/** One plotted point: the current window, and the same slot one window back. */
interface Point { x: string; now: number | null; was: number | null }
const pickMetric = (d: DailyPoint | undefined, m: Metric): number => {
  if (!d) return 0;
  if (m === 'orders') return d.orders;
  const rev = Number(d.revenue);
  if (m === 'revenue') return rev;
  return d.orders > 0 ? rev / d.orders : 0;
};

export default function AnalyticsPage({ branches }: { branches: BranchResponse[] }) {
  const { user } = useAuth();
  const { lang } = useI18n();
  const t = useT(DICT);
  const reduce = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const tok = useChartTokens(rootRef);
  const [range, setRange] = useState<Range>('today');
  const [section, setSection] = useState<Section>('overview');
  const [metric, setMetric] = useState<Metric>('revenue');
  const [customerDirectoryOpen, setCustomerDirectoryOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [customerPage, setCustomerPage] = useState(0);
  const todayD = omanDate();
  const [customFrom, setCustomFrom] = useState(omanDate(new Date(Date.now() - 29 * DAY)));
  const [customTo, setCustomTo] = useState(todayD);

  const canPickBranch = branches.length > 0 && user!.branchId == null;
  const [branchFilter, setBranchFilter] = useState<number | 'all'>('all');
  const branchQs = canPickBranch && branchFilter !== 'all' ? `&branchId=${branchFilter}` : '';

  const nm = (en: string, ar: string) => (lang === 'ar' ? ar || en : en || ar);
  const cur = lang === 'ar' ? 'ر.ع' : 'OMR';

  const restaurantQ = useQuery({
    queryKey: ['restaurant', user!.restaurantId],
    queryFn: () => api.get<Restaurant>(`/api/restaurants/${user!.restaurantId}`),
    enabled: !!user!.restaurantId,
    refetchOnMount: 'always',
  });
  const planReady = restaurantQ.isSuccess && !!restaurantQ.data;
  const isPro = planReady && isProPlan(restaurantQ.data!.plan);

  // API window — Standard is capped at Today / 7d even if range state is stale.
  const queryRange: Range = useMemo(() => {
    if (!planReady || isPro) return range;
    return range === '30d' || range === '90d' || range === 'custom' ? '7d' : range;
  }, [planReady, isPro, range]);

  const PRESET_DAYS: Record<Exclude<Range, 'custom'>, number> = { today: 1, '7d': 7, '30d': 30, '90d': 90 };
  const win = queryRange === 'custom'
    ? { from: customFrom || todayD, to: customTo || todayD }
    : { from: omanDate(new Date(Date.now() - (PRESET_DAYS[queryRange] - 1) * DAY)), to: todayD };
  const from = win.from, to = win.to;
  const rangeQs = `from=${from}&to=${to}`;
  const isMulti = queryRange !== 'today';
  const spanDays = Math.max(1, Math.round((new Date(to + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime()) / DAY) + 1);

  const prev = queryRange === 'today'
    ? { from: omanDate(new Date(Date.now() - 7 * DAY)), to: omanDate(new Date(Date.now() - 7 * DAY)) }
    : (() => { const fromMs = new Date(from + 'T00:00:00').getTime(); return { from: ymd(fromMs - spanDays * DAY), to: ymd(fromMs - DAY) }; })();

  // Keep the picker in sync when a café is downgraded from Pro.
  useEffect(() => {
    if (!planReady || isPro) return;
    if (range === '30d' || range === '90d' || range === 'custom') setRange('7d');
  }, [planReady, isPro, range]);
  useEffect(() => { setCustomerPage(0); }, [branchFilter]);

  const summaryQ = useQuery({
    queryKey: ['analytics-summary', queryRange, from, to, branchFilter],
    enabled: planReady,
    queryFn: () => queryRange === 'today'
      ? api.get<Summary>(`/api/dashboard/analytics/today${branchQs ? `?${branchQs.slice(1)}` : ''}`)
      : api.get<Summary>(`/api/dashboard/analytics/orders?${rangeQs}${branchQs}`),
  });

  const prevQ = useQuery({
    queryKey: ['analytics-prev', queryRange, from, to, branchFilter],
    enabled: planReady,
    queryFn: () => api.get<Summary>(`/api/dashboard/analytics/orders?from=${prev.from}&to=${prev.to}${branchQs}`),
  });

  const dailyQ = useQuery({
    queryKey: ['an-daily', queryRange, from, to, branchFilter],
    enabled: planReady && isMulti,
    queryFn: () => api.get<DailyPoint[]>(`/api/dashboard/analytics/daily?${rangeQs}${branchQs}`),
  });

  /* The ghost series behind the current one. /daily caps the SPAN, not how far
     back you may look, so the previous window is the same length as the current
     one and stays inside a Standard plan's allowance. If it does fail the chart
     simply renders without a comparison rather than erroring. */
  const prevDailyQ = useQuery({
    queryKey: ['an-daily-prev', queryRange, prev.from, prev.to, branchFilter],
    enabled: planReady && isMulti,
    retry: false,
    queryFn: () => api.get<DailyPoint[]>(`/api/dashboard/analytics/daily?from=${prev.from}&to=${prev.to}${branchQs}`),
  });

  const daypartQ = useQuery({
    queryKey: ['an-daypart', queryRange, from, to, branchFilter],
    enabled: planReady,
    queryFn: () => api.get<DaypartPoint[]>(`/api/dashboard/analytics/daypart?${rangeQs}${branchQs}`),
  });

  const kitchenQ = useQuery({
    queryKey: ['an-kitchen', queryRange, from, to, branchFilter],
    enabled: planReady && isPro,
    queryFn: () => api.get<KitchenTiming>(`/api/dashboard/analytics/pro/kitchen-timing?${rangeQs}${branchQs}`),
  });

  const convQ = useQuery({ queryKey: ['an-conv', queryRange, from, to, branchFilter], enabled: planReady && isPro, queryFn: () => api.get<Conversion[]>(`/api/dashboard/analytics/pro/item-conversion?${rangeQs}${branchQs}`) });
  const funnelQ = useQuery({ queryKey: ['an-funnel', queryRange, from, to, branchFilter], enabled: planReady && isPro, queryFn: () => api.get<Funnel>(`/api/dashboard/analytics/pro/funnel?${rangeQs}${branchQs}`) });
  const basketQ = useQuery({ queryKey: ['an-basket', queryRange, from, to, branchFilter], enabled: planReady && isPro, queryFn: () => api.get<Affinity[]>(`/api/dashboard/analytics/pro/market-basket?${rangeQs}${branchQs}&limit=6`) });
  const staffQ = useQuery({ queryKey: ['an-staff', queryRange, from, to, branchFilter], enabled: planReady && isPro, queryFn: () => api.get<Staff[]>(`/api/dashboard/analytics/pro/staff?${rangeQs}${branchQs}`) });
  const forecastQ = useQuery({ queryKey: ['an-forecast', branchFilter], enabled: planReady && isPro, queryFn: () => api.get<ForecastSlot[]>(`/api/dashboard/analytics/pro/forecast?weeks=4${branchQs}`) });
  const customersQ = useQuery({ queryKey: ['an-customers', branchFilter], enabled: planReady && isPro, queryFn: () => api.get<Customers>(`/api/dashboard/analytics/pro/customers${branchQs ? `?${branchQs.slice(1)}` : ''}`) });
  const customerBaseQ = useQuery({ queryKey: ['an-customer-base', branchFilter], enabled: planReady && isPro, queryFn: () => api.get<CustomerBase>(`/api/dashboard/analytics/pro/customer-base${branchQs ? `?${branchQs.slice(1)}` : ''}`) });
  const paymentMethodsQ = useQuery({
    queryKey: ['an-payment-methods', queryRange, from, to, branchFilter],
    enabled: planReady,
    queryFn: () => api.get<PaymentMethodRevenue[]>(`/api/dashboard/analytics/payment-methods?${rangeQs}${branchQs}`),
  });
  const customerDirectoryQ = useQuery({
    queryKey: ['an-customer-directory', branchFilter, customerPage, customerSearchTerm],
    enabled: planReady && isPro && customerDirectoryOpen,
    queryFn: () => api.get<PageResponse<CustomerDirectoryRow>>(
      `/api/dashboard/analytics/pro/customer-directory?page=${customerPage}&size=50&search=${encodeURIComponent(customerSearchTerm)}${branchQs}`,
    ),
  });
  // Benchmark temporarily disabled — see commented card below. Re-enable when reworked.
  // const benchmarkQ = useQuery({ queryKey: ['an-benchmark'], enabled: isPro, queryFn: () => api.get<Benchmark>('/api/dashboard/analytics/pro/benchmark') });

  const s = summaryQ.data;

  /* Plain-language notes, prioritised & capped at 3 — same voice as the weekly
     email. The tag names the KIND of finding, which is information; the emoji
     it replaced only said "friendly product". */
  const notes = useMemo(() => {
    if (!s) return [] as Array<{ tag: string; text: string }>;
    const out: Array<{ tag: string; text: string }> = [];
    if (queryRange === 'today' && s.busiestHours.length) {
      const peak = [...s.busiestHours].sort((a, b) => b.orders - a.orders)[0];
      out.push({ tag: t('a_tagPeak'), text: t('a_insBusiest').replace('{h}', hourLabel(peak.hour)) });
    }
    const top = s.bestSellingItems[0];
    const totalRev = Number(s.totalRevenue);
    if (top && totalRev > 0) {
      const share = Math.round((Number(top.totalRevenue) / totalRev) * 100);
      if (share > 0) out.push({ tag: t('a_tagTop'), text: t('a_insTop').replace('{name}', nm(top.nameEn, top.nameAr)).replace('{p}', String(share)) });
    }
    if (isPro) {
      const weak = (convQ.data ?? []).filter((c) => c.views >= MIN_VIEWS_FOR_WEAK).sort((a, b) => Number(a.conversionRate) - Number(b.conversionRate))[0];
      if (weak) out.push({ tag: t('a_tagWeak'), text: t('a_insWeak').replace('{name}', nm(weak.nameEn, weak.nameAr)) });
      const risk = customersQ.data?.atRisk.length ?? 0;
      if (risk > 0) out.push({ tag: t('a_tagQuiet'), text: t('a_insRisk').replace('{n}', String(risk)) });
    }
    return out.slice(0, 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, queryRange, isPro, convQ.data, customersQ.data, lang]);

  /* What the primary chart plots. On Today only hourly ORDER counts exist —
     revenue is not bucketed by hour — so the ledger stops driving the chart and
     the header says what is actually on screen. */
  const plotted: Metric = isMulti ? metric : 'orders';

  const chart = useMemo(() => {
    if (!isMulti) {
      const nowH = omanHour();
      const cur = new Map((s?.busiestHours ?? []).map((h) => [h.hour, h.orders]));
      const was = new Map((prevQ.data?.busiestHours ?? []).map((h) => [h.hour, h.orders]));
      const hrs = [...new Set([...cur.keys(), ...was.keys()])].sort((a, b) => a - b);
      if (!hrs.length) return [] as Point[];
      const pts: Point[] = [];
      for (let h = hrs[0]; h <= hrs[hrs.length - 1]; h++) {
        pts.push({
          x: hourLabel(h),
          /* The day is still running. Past the current hour there is no data
             yet, and plotting a zero there reads as demand collapsing rather
             than as the day not having happened — so the line stops instead.
             The ghost keeps going, which is the whole point: you can see where
             last week was by this hour, and where it finished. */
          now: h <= nowH ? cur.get(h) ?? 0 : null,
          was: was.size ? was.get(h) ?? 0 : null,
        });
      }
      return pts;
    }
    const curMap = new Map((dailyQ.data ?? []).map((d) => [d.date, d]));
    const wasMap = new Map((prevDailyQ.data ?? []).map((d) => [d.date, d]));
    const hasWas = wasMap.size > 0;
    const curDays = dayList(from, spanDays);
    const wasDays = dayList(prev.from, spanDays);
    const week = lang === 'ar' ? WEEK_AR : WEEK_EN;
    return curDays.map((iso, i) => ({
      x: spanDays <= 8 ? week[dowIndex(iso)] : fmtDate(iso, lang, { day: 'numeric', month: 'short' }),
      now: pickMetric(curMap.get(iso), metric),
      was: hasWas ? pickMetric(wasMap.get(wasDays[i]), metric) : null,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMulti, s, prevQ.data, dailyQ.data, prevDailyQ.data, metric, from, prev.from, spanDays, lang]);

  const shortWin = (a: string, b: string) => (a === b
    ? fmtDate(a, lang, { day: 'numeric', month: 'short' })
    : `${fmtDate(a, lang, { day: 'numeric', month: 'short' })} – ${fmtDate(b, lang, { day: 'numeric', month: 'short' })}`);
  const curLabel = shortWin(from, to);
  const prevLabel = shortWin(prev.from, prev.to);
  const windowLabel = queryRange === 'today'
    ? fmtDate(to, lang, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : `${fmtDate(from, lang, { day: 'numeric', month: 'short' })} – ${fmtDate(to, lang, { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const presets: Range[] = isPro ? ['today', '7d', '30d', '90d', 'custom'] : ['today', '7d'];
  const tabs: Array<{ key: Section; label: string; locked: boolean }> = [
    { key: 'overview', label: t('a_secOverview'), locked: false },
    { key: 'menu', label: t('a_secMenu'), locked: false },
    { key: 'team', label: t('a_secTeam'), locked: !isPro },
    { key: 'customers', label: t('a_secCustomers'), locked: !isPro },
  ];
  const bestSellerCap = isPro ? 8 : 5;
  const metricLabel: Record<Metric, string> = { revenue: t('a_revenue'), orders: t('a_orders'), aov: t('a_aov') };

  if (restaurantQ.isError) {
    return (
      <ErrCard
        message={restaurantQ.error instanceof ApiError ? restaurantQ.error.message : t('a_noData')}
        onRetry={() => restaurantQ.refetch()}
        t={t}
      />
    );
  }
  if (restaurantQ.isLoading || !planReady) return <Skeleton />;

  return (
    <div className="an" ref={rootRef}>
      <div className="an-bar">
        <div className="an-nav" role="tablist" aria-label={t('a_secOverview')}>
          {tabs.map((tab) => (
            <button key={tab.key} role="tab" id={`an-tab-${tab.key}`} aria-selected={section === tab.key}
              aria-controls="an-pane" className={section === tab.key ? 'on' : ''}
              onClick={() => setSection(tab.key)}>
              {tab.label}{tab.locked && <span className="an-lock-ic" aria-hidden>🔒</span>}
            </button>
          ))}
        </div>
        <div className="an-ctl">
          <div className="an-seg" role="group" aria-label={t('a_custom')}>
            {presets.map((p) => (
              <button key={p} aria-pressed={range === p} className={range === p ? 'on' : ''}
                onClick={() => setRange(p)}>{p === 'today' ? t('a_today') : p === '7d' ? t('a_7d') : p === '30d' ? t('a_30d') : p === '90d' ? t('a_90d') : t('a_custom')}</button>
            ))}
          </div>
          {isPro && range === 'custom' && (
            <div className="an-daterange">
              <input type="date" value={customFrom} max={customTo || todayD} onChange={(e) => setCustomFrom(e.target.value)} aria-label={t('a_custom')} />
              <span className="an-dr-sep">–</span>
              <input type="date" value={customTo} min={customFrom} max={todayD} onChange={(e) => setCustomTo(e.target.value)} aria-label={t('a_custom')} />
            </div>
          )}
          {canPickBranch && (
            <select className="an-branch-sel" value={branchFilter} aria-label={t('a_allBranches')} onChange={(e) => setBranchFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
              <option value="all">{t('a_allBranches')}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div className="an-pane" id="an-pane" role="tabpanel" aria-labelledby={`an-tab-${section}`}
          key={section + range + branchFilter} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>

          {/* ---------- OVERVIEW ---------- */}
          {section === 'overview' && (
            <>
            {summaryQ.isLoading ? <Skeleton /> :
            summaryQ.isError ? (
              isPlanRequiredError(summaryQ.error)
                ? <ProUpsell desc={t('a_lockRange')} tags={[t('a_30d'), t('a_90d')]} t={t} />
                : <ErrCard message={summaryQ.error instanceof ApiError ? summaryQ.error.message : t('a_noData')} onRetry={() => summaryQ.refetch()} t={t} />
            ) :
            s ? (
              <>
                <p className="an-ctx">
                  <span>{windowLabel}</span>
                  {prevQ.data && <b>{t('a_comparedWith').replace('{d}', prevLabel)}</b>}
                </p>

                <div className="an-ledger">
                  <LedgerCell k={t('a_revenue')} v={omr(s.totalRevenue)} unit={cur} on={plotted === 'revenue'}
                    d={delta(Number(s.totalRevenue), prevQ.data ? Number(prevQ.data.totalRevenue) : null)}
                    pick={isMulti ? () => setMetric('revenue') : undefined} t={t} />
                  <LedgerCell k={t('a_orders')} v={s.totalOrders.toLocaleString()} on={plotted === 'orders'}
                    d={delta(s.totalOrders, prevQ.data ? prevQ.data.totalOrders : null)}
                    pick={isMulti ? () => setMetric('orders') : undefined} t={t} />
                  <LedgerCell k={t('a_aov')} v={omr(s.averageOrderValue)} unit={cur} on={plotted === 'aov'}
                    d={delta(Number(s.averageOrderValue), prevQ.data ? Number(prevQ.data.averageOrderValue) : null)}
                    pick={isMulti ? () => setMetric('aov') : undefined} t={t} />
                </div>

                <ChartPanel points={chart} hourly={!isMulti} metric={plotted} label={metricLabel[plotted]}
                  curLabel={curLabel} prevLabel={prevLabel} cur={cur} tok={tok} t={t} />

                {notes.length > 0 && (
                  <motion.ul className="an-notes" variants={listV} initial={reduce ? false : 'hidden'} animate="show">
                    {notes.map((n, i) => (
                      <motion.li key={i} className="an-note" variants={itemV}>
                        <span className="an-note-tag">{n.tag}</span>{n.text}
                      </motion.li>
                    ))}
                  </motion.ul>
                )}

                <section className="an-sec">
                  <div className="an-sec-hd"><h2>{t('a_secService')}</h2></div>
                  <div className="an-cols">
                    <section className="an-block">
                      <h3>{t('a_status')}</h3>
                      <StatusBreakdown s={s} t={t} />
                    </section>
                    {daypartQ.data && (
                      <section className="an-block">
                        <h3>{t('a_daypart')}</h3>
                        <DaypartCard rows={daypartQ.data} t={t} />
                      </section>
                    )}
                    {paymentMethodsQ.data && (
                      <section className="an-block">
                        <h3>{t('a_paymentSplit')}</h3>
                        <PaymentSplitCard rows={paymentMethodsQ.data} t={t} />
                      </section>
                    )}
                  </div>
                </section>

                {/* Benchmark card temporarily disabled — needs rework (small-sample UX,
                    per-café volume floor, like-for-like cohort). Re-enable benchmarkQ above
                    to restore. NOTE: the daybook-era .an-bench styles were dropped in the
                    console redesign, so BenchRow needs a restyle when it comes back. */}
              </>
            ) : null}

            {/* Weekly rhythm reflects the last 4 weeks, independent of the selected
                range — kept outside the summary gate so it doesn't blank out while the
                summary above refetches on a range change. */}
            {isPro && forecastQ.data?.length ? (
              <section className="an-sec">
                <div className="an-sec-hd"><h2>{t('a_forecast')}</h2></div>
                <section className="an-block narrow">
                  <WeeklyRhythm slots={forecastQ.data} lang={lang} t={t} />
                </section>
              </section>
            ) : null}
            </>
          )}

          {/* ---------- MENU ---------- */}
          {section === 'menu' && (
            summaryQ.isLoading ? <Skeleton /> : (
              <>
                {isPro && funnelQ.data && <FunnelCard data={funnelQ.data} t={t} />}

                <section className="an-sec">
                  <div className="an-sec-hd"><h2>{t('a_secItems')}</h2></div>
                  <div className="an-cols pair">
                    <section className="an-block">
                      <h3>{t('a_bestsellers')}</h3>
                      {!s || s.bestSellingItems.length === 0 ? <p className="an-empty">{t('a_noOrders')}</p> : (() => {
                        const rows = s.bestSellingItems.slice(0, bestSellerCap);
                        /* Tint by quantity, not revenue: the API ranks these by
                           SUM(quantity) DESC, so tinting by revenue makes row 5 wider
                           than row 1 and the weight contradicts the rank. */
                        const maxQty = Math.max(...rows.map((it) => it.totalQuantity), 1);
                        return (
                          <RankTable
                            head={[t('a_item'), t('a_qty'), t('a_revenue')]}
                            rows={rows.map((it) => ({
                              key: it.menuItemId,
                              name: nm(it.nameEn, it.nameAr),
                              share: (it.totalQuantity / maxQty) * 100,
                              cells: [String(it.totalQuantity), omr(it.totalRevenue)],
                            }))}
                          />
                        );
                      })()}
                    </section>

                    {isPro && (
                      <section className="an-block">
                        <h3>{t('a_conv')} <small>{t('a_convSub')}</small></h3>
                        {!convQ.data?.length ? <p className="an-empty">{t('a_noData')}</p> : (() => {
                          const rows = convQ.data.slice(0, 8);
                          const weakId = rows.filter((c) => c.views >= MIN_VIEWS_FOR_WEAK)
                            .sort((a, b) => Number(a.conversionRate) - Number(b.conversionRate))[0]?.menuItemId;
                          return (
                            <RankTable
                              head={[t('a_item'), t('a_views'), t('a_rate')]}
                              rows={rows.map((c) => ({
                                key: c.menuItemId,
                                name: <>{nm(c.nameEn, c.nameAr)}{c.menuItemId === weakId && <i className="an-tag">{t('a_low')}</i>}</>,
                                share: Math.min(100, Math.round(Number(c.conversionRate) * 100)),
                                cells: [String(c.views), `${Math.round(Number(c.conversionRate) * 100)}%`],
                              }))}
                            />
                          );
                        })()}
                      </section>
                    )}

                    {isPro && (
                      <section className="an-block">
                        <h3>{t('a_basket')}</h3>
                        {!basketQ.data?.length ? (
                          <p className="an-empty hint">{t('a_basketHint')}</p>
                        ) : (
                          <motion.ul className="an-pairs" variants={listV} initial={reduce ? false : 'hidden'} animate="show">
                            {basketQ.data.map((p) => (
                              <motion.li key={`${p.itemAId}-${p.itemBId}`} className="an-pair" variants={itemV}>
                                <span className="an-pair-names">{nm(p.aNameEn, p.aNameAr)} <i>+</i> {nm(p.bNameEn, p.bNameAr)}</span>
                                <span className="an-pair-n">{p.coOrders}{t('a_together')}</span>
                              </motion.li>
                            ))}
                          </motion.ul>
                        )}
                      </section>
                    )}
                  </div>
                </section>

                {!isPro && <ProUpsell desc={t('a_lockMenu')} tags={[t('a_conv'), t('a_basket')]} t={t} />}
              </>
            )
          )}

          {/* ---------- TEAM ---------- */}
          {section === 'team' && (
            !isPro ? <ProUpsell desc={t('a_lockTeam')} tags={[t('a_staff')]} t={t} /> :
            staffQ.isLoading ? <Skeleton cards={1} /> : (
              <div className="an-cols pair">
                <section className="an-block">
                  <h3>{t('a_staff')}</h3>
                  {!staffQ.data?.length ? <p className="an-empty">{t('a_noData')}</p> : (() => {
                    const rows = [...staffQ.data].sort((a, b) => b.completed - a.completed);
                    const max = Math.max(...rows.map((m) => m.completed), 1);
                    return (
                      <RankTable
                        head={[t('a_member'), t('a_done'), t('a_avgAccept')]}
                        rows={rows.map((m) => ({
                          key: m.actorUserId,
                          name: m.actorName,
                          share: (m.completed / max) * 100,
                          cells: [String(m.completed), m.avgAcceptSeconds == null ? t('a_never') : `${Math.round(m.avgAcceptSeconds)}${t('a_sec')}`],
                        }))}
                      />
                    );
                  })()}
                </section>
                {kitchenQ.data && (
                  <section className="an-block">
                    <h3>{t('a_kitchen')}</h3>
                    <KitchenCard d={kitchenQ.data} t={t} />
                  </section>
                )}
              </div>
            )
          )}

          {/* ---------- CUSTOMERS ---------- */}
          {section === 'customers' && (
            !isPro ? <ProUpsell desc={t('a_lockCustomers')} tags={[t('a_regulars'), t('a_atrisk')]} t={t} /> :
            customerDirectoryOpen ? (
              <CustomerDirectoryTable
                data={customerDirectoryQ.data}
                loading={customerDirectoryQ.isLoading}
                search={customerSearch}
                page={customerPage}
                lang={lang}
                t={t}
                onSearch={setCustomerSearch}
                onSubmit={() => { setCustomerSearchTerm(customerSearch.trim()); setCustomerPage(0); }}
                onPage={setCustomerPage}
                onBack={() => setCustomerDirectoryOpen(false)}
              />
            ) : customersQ.isLoading ? <Skeleton cards={2} /> : (
              <>
                <div className="an-actions">
                  <button className="an-btn" onClick={() => setCustomerDirectoryOpen(true)}>{t('a_allCustomers')}</button>
                </div>
                {customerBaseQ.data && customerBaseQ.data.totalCustomers > 0 && (
                  <section className="an-block">
                    <h3>{t('a_cbase')}</h3>
                    <CustomerBaseCard d={customerBaseQ.data} t={t} />
                  </section>
                )}
                <div className="an-cols pair">
                  <section className="an-block">
                    <h3>{t('a_regulars')}</h3>
                    {!customersQ.data?.topRegulars.length ? <p className="an-empty">{t('a_noData')}</p> : (
                      <motion.ul className="an-people" variants={listV} initial={reduce ? false : 'hidden'} animate="show">
                        {customersQ.data.topRegulars.slice(0, 8).map((c) => (
                          <motion.li key={c.profileId} variants={itemV}>
                            <span className="an-av on">{(c.name || c.phone).slice(0, 1)}</span>
                            <span className="an-li-name">{c.name || c.phone}</span>
                            <span className="an-li-val">{c.orderCount} {t('a_ordersN')}</span>
                          </motion.li>
                        ))}
                      </motion.ul>
                    )}
                  </section>
                  <section className="an-block">
                    <h3>{t('a_atrisk')}</h3>
                    {!customersQ.data?.atRisk.length ? <p className="an-empty">{t('a_noData')}</p> : (
                      <motion.ul className="an-people" variants={listV} initial={reduce ? false : 'hidden'} animate="show">
                        {customersQ.data.atRisk.slice(0, 8).map((c) => (
                          <motion.li key={c.profileId} variants={itemV}>
                            <span className="an-av">{(c.name || c.phone).slice(0, 1)}</span>
                            <span className="an-li-name">{c.name || c.phone}</span>
                            <span className="an-li-val">{c.lastOrderAt ? fmtDate(c.lastOrderAt.slice(0, 10), lang, { day: 'numeric', month: 'short' }) : t('a_never')}</span>
                          </motion.li>
                        ))}
                      </motion.ul>
                    )}
                  </section>
                </div>
              </>
            )
          )}

        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* =====================================================================
   Ledger cell — one column of the rail. A button when it can drive the
   chart (multi-day), plain text when it can't (Today has no hourly
   revenue to plot), so the affordance never lies about what will happen.
   ===================================================================== */
function LedgerCell({ k, v, unit, d, on, pick, t }: {
  k: string; v: string; unit?: string; d: Delta; on: boolean; pick?: () => void; t: T;
}) {
  const body = (
    <>
      <span className="an-led-k">{k}</span>
      <span className="an-led-r">
        <span className="an-led-v">{v}{unit && <small>{unit}</small>}</span>
        <DeltaText d={d} t={t} />
      </span>
    </>
  );
  if (!pick) return <div className="an-led" data-on={on || undefined}>{body}</div>;
  return (
    <button type="button" className="an-led" data-pick="" data-on={on || undefined}
      aria-pressed={on} onClick={pick}>{body}</button>
  );
}

function DeltaText({ d, t }: { d: Delta; t: T }) {
  if (d.dir === 'none') return <span className="an-led-d">—</span>;
  if (d.dir === 'new') return <span className="an-led-d up">{t('a_new')}</span>;
  if (d.dir === 'flat') return <span className="an-led-d">0%</span>;
  return <span className={'an-led-d ' + d.dir}>{d.dir === 'up' ? '▲' : '▼'} {d.pct}%</span>;
}

/* =====================================================================
   Primary chart — the current window solid, the one before it dashed.
   ===================================================================== */
function ChartPanel({ points, hourly, metric, label, curLabel, prevLabel, cur, tok, t }: {
  points: Point[]; hourly: boolean; metric: Metric; label: string;
  curLabel: string; prevLabel: string; cur: string; tok: ChartTokens; t: T;
}) {
  const hasWas = points.some((p) => p.was != null);
  const fmtY = (v: number) => (metric === 'orders' || v % 1 === 0 || v >= 100 ? String(Math.round(v)) : v.toFixed(1));
  return (
    <section className="an-panel">
      <div className="an-panel-hd">
        <h3>{label} <small>{hourly ? t('a_byHour') : t('a_byDay')}</small></h3>
        <div className="an-legend">
          <span><i />{curLabel}</span>
          {hasWas && <span><i className="was" />{prevLabel}</span>}
        </div>
      </div>
      {points.length === 0 ? <p className="an-empty">{t('a_noOrders')}</p> : (
        <div className="an-plot">
          <ResponsiveContainer>
            <AreaChart data={points} margin={{ top: 6, right: 6, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="anNowFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={tok['--lime']} stopOpacity={0.24} />
                  <stop offset="100%" stopColor={tok['--lime']} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={tok['--line-2']} strokeOpacity={0.45} />
              <XAxis dataKey="x" tick={{ fill: tok['--faint'], fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }}
                axisLine={{ stroke: tok['--line-2'] }} tickLine={false} interval="preserveStartEnd" minTickGap={26} />
              <YAxis tick={{ fill: tok['--faint'], fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }}
                axisLine={false} tickLine={false} width={46} tickFormatter={fmtY} />
              <Tooltip cursor={{ stroke: tok['--muted'], strokeWidth: 1, strokeDasharray: '3 3' }}
                content={<ChartTip metric={metric} cur={cur} curLabel={curLabel} prevLabel={prevLabel} />} />
              {/* drawn first so the current window sits on top of it */}
              {hasWas && (
                <Area type="monotone" dataKey="was" stroke={tok['--faint']} strokeWidth={1.5} strokeDasharray="4 3"
                  fill="none" dot={false} connectNulls isAnimationActive={false} />
              )}
              <Area type="monotone" dataKey="now" stroke={tok['--accent-text']} strokeWidth={2} fill="url(#anNowFill)"
                dot={false} connectNulls={false}
                activeDot={{ r: 4, fill: tok['--accent-text'], stroke: tok['--bg-2'], strokeWidth: 1.5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function ChartTip({ active, payload, label, metric, cur, curLabel, prevLabel }: {
  active?: boolean; payload?: Array<{ dataKey?: string | number; value?: number }>; label?: string;
  metric: Metric; cur: string; curLabel: string; prevLabel: string;
}) {
  if (!active || !payload?.length) return null;
  const at = (k: string) => payload.find((p) => p.dataKey === k)?.value;
  const now = at('now');
  const was = at('was');
  if (now == null && was == null) return null;
  const fmt = (v: number) => (metric === 'orders' ? String(Math.round(v)) : `${omr(v)} ${cur}`);
  const d = now != null && was != null ? delta(now, was) : null;
  return (
    <div className="an-tip">
      <span className="an-tip-k">{label}</span>
      {now != null && <div className="an-tip-row"><span>{curLabel}</span><b>{fmt(now)}</b></div>}
      {was != null && <div className="an-tip-row was"><span>{prevLabel}</span><b>{fmt(was)}</b></div>}
      {d && (d.dir === 'up' || d.dir === 'down') && (
        <div className={'an-tip-d ' + d.dir}>{d.dir === 'up' ? '▲' : '▼'} {d.pct}%</div>
      )}
    </div>
  );
}

/* =====================================================================
   Ranked table — the share is the row's own background. One element per
   row instead of a name, a value and a separate bar track.
   ===================================================================== */
function RankTable({ head, rows }: {
  head: [string, string, string];
  rows: Array<{ key: React.Key; name: ReactNode; share: number; cells: [string, string] }>;
}) {
  return (
    <table className="an-tbl">
      <thead>
        <tr>
          <th className="rk"><span className="sr-only" /></th>
          <th>{head[0]}</th>
          <th className="n">{head[1]}</th>
          <th className="n">{head[2]}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.key} className="sh"
            style={{ '--sh': `${Math.max(0, Math.min(100, r.share))}%` } as CSSProperties}>
            <td className="rk">{i + 1}</td>
            <td className="name">{r.name}</td>
            <td className="n q">{r.cells[0]}</td>
            <td className="n">{r.cells[1]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* =====================================================================
   Order status — one stacked bar, numbers underneath
   ===================================================================== */
function StatusBreakdown({ s, t }: { s: Summary; t: T }) {
  const segs = [
    // Completed uses the darker accent, not --lime: against --ready's light green the two
    // sat at ΔE 11.4 (floor is 15), so the bar's two biggest segments were hard to tell
    // apart even with full colour vision. --ready stays as-is; it's shared with the KDS.
    { k: 'a_completed', n: s.completedOrders, c: 'var(--accent-text)' },
    { k: 'a_ready', n: s.readyOrders, c: 'var(--ready)' },
    { k: 'a_inprogress', n: s.acceptedOrders + s.preparingOrders, c: 'var(--accepted)' },
    { k: 'a_pending', n: s.pendingOrders, c: 'var(--pending)' },
    { k: 'a_cancelled', n: s.declinedOrders + s.cancelledOrders, c: 'var(--bad)' },
  ].filter((x) => x.n > 0);
  const total = segs.reduce((a, b) => a + b.n, 0);
  if (total === 0) return <p className="an-empty">{t('a_noOrders')}</p>;
  return (
    <>
      {/* The bar is decorative on its own — the table below carries the numbers, so
          screen readers get one summary here rather than five unlabelled divs. */}
      <div className="an-stack" role="img" aria-label={segs.map((g) => `${t(g.k)}: ${g.n}`).join(', ')}>
        {segs.map((g) => <div key={g.k} className="an-stack-seg" style={{ flex: g.n, background: g.c }} />)}
      </div>
      <table className="an-tbl">
        <tbody>
          {segs.map((g) => (
            <tr key={g.k}>
              <td className="name"><span className="an-key" style={{ background: g.c }} />{t(g.k)}</td>
              <td className="n">{g.n}</td>
              <td className="n q">{Math.round((g.n / total) * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/* =====================================================================
   Pro · conversion funnel (menu view → cart → checkout → order)
   ===================================================================== */
function FunnelCard({ data, t }: { data: Funnel; t: T }) {
  const reduce = useReducedMotion();
  const stages = [
    { key: 'a_fn_views', n: data.menuViews },
    { key: 'a_fn_cart', n: data.addedToCart },
    { key: 'a_fn_checkout', n: data.checkoutStarted },
    { key: 'a_fn_orders', n: data.ordersPlaced },
  ];
  const top = stages[0].n || 1;
  const overall = data.menuViews > 0 ? Math.round((data.ordersPlaced / data.menuViews) * 100) : 0;
  return (
    <section className="an-block">
      <div className="an-block-hd">
        <h3>{t('a_funnel')} <small>{t('a_fn_sub')}</small></h3>
        <span className="an-fn-overall">{overall}<small>%</small></span>
      </div>
      {data.menuViews === 0 ? <p className="an-empty">{t('a_noData')}</p> : (
        <motion.ul className="an-funnel" variants={listV} initial={reduce ? false : 'hidden'} animate="show">
          {stages.map((s, i) => {
            const step = i > 0 && stages[i - 1].n > 0 ? Math.round((s.n / stages[i - 1].n) * 100) : null;
            return (
              <motion.li className="an-fn-row" key={s.key} variants={itemV}>
                <div className="an-fn-top">
                  <span className="an-fn-label">{t(s.key)}</span>
                  <span className="an-fn-n">{s.n.toLocaleString()}{step !== null && <i className="an-fn-step">{step}%</i>}</span>
                </div>
                <div className="an-fn-track">
                  <motion.div className="an-fn-fill" style={{ width: `${(s.n / top) * 100}%` }}
                    initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }}
                    transition={{ delay: reduce ? 0 : 0.1 + i * 0.08, duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }} />
                </div>
              </motion.li>
            );
          })}
        </motion.ul>
      )}
    </section>
  );
}

/* ---- Weekly rhythm — one self-drawing demand curve per weekday ---- */
const RH_W = 100, RH_H = 30, RH_PAD = 3;
function WeeklyRhythm({ slots, lang, t }: { slots: ForecastSlot[]; lang: string; t: T }) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<{ row: number; idx: number } | null>(null);

  const { rows, busiest, hours, maxV, hasData } = useMemo(() => {
    const m = new Map<string, number>(); let mx = 0; const hrs = new Set<number>();
    for (const sl of slots) { m.set(`${sl.dayOfWeek}-${sl.hour}`, sl.expectedOrders); if (sl.expectedOrders > 0) { hrs.add(sl.hour); if (sl.expectedOrders > mx) mx = sl.expectedOrders; } }
    const hours = [...hrs].sort((a, b) => a - b);
    const maxV = mx || 1;
    const xFor = (i: number, n: number) => (n <= 1 ? RH_W / 2 : (i / (n - 1)) * RH_W);
    const yFor = (v: number) => RH_H - RH_PAD - (v / maxV) * (RH_H - 2 * RH_PAD);
    const built = [1, 2, 3, 4, 5, 6, 7].map((d) => {
      const vals = hours.map((h) => m.get(`${d}-${h}`) ?? 0);
      const n = vals.length;
      let pk = 0; vals.forEach((v, i) => { if (v > vals[pk]) pk = i; });
      const line = vals.map((v, i) => `${i ? 'L' : 'M'}${xFor(i, n).toFixed(1)} ${yFor(v).toFixed(1)}`).join(' ');
      const area = `M${xFor(0, n).toFixed(1)} ${RH_H} ${vals.map((v, i) => `L${xFor(i, n).toFixed(1)} ${yFor(v).toFixed(1)}`).join(' ')} L${xFor(n - 1, n).toFixed(1)} ${RH_H} Z`;
      return {
        d, line, area, vals,
        peakHour: hours[pk], peakVal: vals[pk], total: vals.reduce((a, b) => a + b, 0),
        peakX: n <= 1 ? 50 : (pk / (n - 1)) * 100,
        peakY: 100 * (RH_PAD + (vals[pk] / maxV) * (RH_H - 2 * RH_PAD)) / RH_H,
      };
    });
    let bd = 0; built.forEach((r, i) => { if (r.total > built[bd].total) bd = i; });
    return { rows: built, busiest: bd, hours, maxV, hasData: hours.length > 0 };
  }, [slots]);

  if (!hasData) return <p className="an-empty">{t('a_noData')}</p>;

  const n = hours.length;
  const xPct = (idx: number) => (n <= 1 ? 50 : (idx / (n - 1)) * 100);
  const bottomPct = (v: number) => (100 * (RH_PAD + (v / maxV) * (RH_H - 2 * RH_PAD))) / RH_H;
  // Four evenly-spaced hour ticks; flex space-between lands them on these fractions.
  const ticks = Array.from(new Set([0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1]));
  const week = lang === 'ar' ? WEEK_AR : WEEK_EN;

  return (
    <>
      <motion.div className="an-rhythm" variants={listV} initial={reduce ? false : 'hidden'} animate="show">
        {rows.map((r, i) => {
          const h = hover?.row === i ? hover.idx : null;
          return (
            <motion.div className={'an-rhythm-row' + (i === busiest ? ' is-peak' : '')} key={r.d} variants={itemV}>
              <span className="an-rhythm-day">{week[r.d]}</span>
              <div className="an-rhythm-plot"
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = rect.width ? (e.clientX - rect.left) / rect.width : 0;
                  setHover({ row: i, idx: Math.max(0, Math.min(n - 1, Math.round(x * (n - 1)))) });
                }}
                onMouseLeave={() => setHover(null)}>
                <svg viewBox={`0 0 ${RH_W} ${RH_H}`} preserveAspectRatio="none" aria-hidden>
                  <motion.path d={r.area} className="an-rhythm-area"
                    initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ delay: reduce ? 0 : 0.1 + i * 0.07, duration: 0.5 }} />
                  <motion.path d={r.line} className="an-rhythm-line" vectorEffect="non-scaling-stroke"
                    initial={reduce ? false : { pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ delay: reduce ? 0 : 0.12 + i * 0.07, duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }} />
                </svg>
                {r.peakVal > 0 && h === null && (
                  <motion.span className="an-rhythm-dot" style={{ left: `${r.peakX}%`, bottom: `${r.peakY}%` }}
                    initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }}
                    transition={{ delay: reduce ? 0 : 0.55 + i * 0.07, type: 'spring', stiffness: 320, damping: 18 }} />
                )}
                {h !== null && (
                  <>
                    <span className="an-rhythm-guide" style={{ left: `${xPct(h)}%` }} />
                    <span className="an-rhythm-hoverdot" style={{ left: `${xPct(h)}%`, bottom: `${bottomPct(r.vals[h])}%` }} />
                    <span className="an-rhythm-tip" style={{ left: `${xPct(h)}%` }}>
                      <b>{hourLabel(hours[h])}</b> · {r.vals[h].toFixed(1)}
                    </span>
                  </>
                )}
              </div>
              <span className="an-rhythm-peak">{r.peakVal > 0 ? <b>{hourLabel(r.peakHour)}</b> : <i className="an-rhythm-quiet">—</i>}</span>
            </motion.div>
          );
        })}
        <div className="an-rhythm-axis">
          <span />
          <div className="an-rhythm-axis-track">
            {ticks.map((idx) => <span key={idx} className="an-rhythm-tick">{hourLabel(hours[idx])}</span>)}
          </div>
          <span />
        </div>
      </motion.div>
      <p className="an-foot">{t('a_rhythmHint')}</p>
    </>
  );
}

/* ---- horizontal meter rows (shared by daypart + kitchen timing) ---- */
function MeterRows({ rows }: { rows: Array<{ label: string; pct: number; value: string; hot?: boolean }> }) {
  const reduce = useReducedMotion();
  return (
    <div className="an-meter">
      {rows.map((r, i) => (
        <div className="an-meter-row" key={i}>
          <span className="an-meter-lbl">{r.label}</span>
          <span className="an-meter-track">
            <motion.span className="an-meter-fill" data-hot={r.hot || undefined}
              style={{ width: `${Math.max(2, r.pct)}%` }}
              initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }}
              transition={{ delay: reduce ? 0 : 0.08 + i * 0.06, duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }} />
          </span>
          <span className="an-meter-val">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ---- Daypart breakdown — orders & revenue by part of day ---- */
const DAYPART_KEY: Record<string, string> = {
  MORNING: 'a_dp_morning', MIDDAY: 'a_dp_midday', AFTERNOON: 'a_dp_afternoon', EVENING: 'a_dp_evening', LATE: 'a_dp_late',
};
function DaypartCard({ rows, t }: { rows: DaypartPoint[]; t: T }) {
  const total = rows.reduce((a, b) => a + b.orders, 0);
  if (total === 0) return <p className="an-empty">{t('a_noOrders')}</p>;
  const max = Math.max(...rows.map((r) => r.orders), 1);
  const peak = rows.reduce((mi, r, i, arr) => (r.orders > arr[mi].orders ? i : mi), 0);
  const meterRows = rows.map((r, i) => ({
    label: t(DAYPART_KEY[r.daypart] ?? r.daypart),
    pct: (r.orders / max) * 100,
    value: `${r.orders} · ${omr(r.revenue)}`,
    hot: i === peak,
  }));
  return <MeterRows rows={meterRows} />;
}

/* ---- Kitchen timing — avg seconds per fulfillment stage, bottleneck flagged ---- */
function fmtDur(sec: number | null, t: T): string {
  if (sec == null) return t('a_never');
  const s = Math.round(sec);
  if (s < 60) return `${s}${t('a_sec')}`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}${t('a_min')} ${r}${t('a_sec')}` : `${m}${t('a_min')}`;
}
function KitchenCard({ d, t }: { d: KitchenTiming; t: T }) {
  if (!d.sampleOrders) return <p className="an-empty">{t('a_noData')}</p>;
  const stages = [
    { k: 'a_kt_accept', v: d.acceptSeconds },
    { k: 'a_kt_prep', v: d.prepSeconds },
    { k: 'a_kt_handoff', v: d.handoffSeconds },
  ];
  const max = Math.max(...stages.map((s) => s.v ?? 0), 1);
  let slowIdx = -1, slowVal = -1;
  stages.forEach((s, i) => { if (s.v != null && s.v > slowVal) { slowVal = s.v; slowIdx = i; } });
  const meterRows = stages.map((s, i) => ({
    label: t(s.k), pct: s.v != null ? (s.v / max) * 100 : 0, value: fmtDur(s.v, t), hot: i === slowIdx,
  }));
  return (
    <>
      <MeterRows rows={meterRows} />
      <div className="an-kt-foot">
        <span>{t('a_kt_toReady')} <b>{fmtDur(d.toReadySeconds, t)}</b></span>
        <span className="dot">·</span>
        <span>{t('a_kt_total')} <b>{fmtDur(d.toCompleteSeconds, t)}</b></span>
        {slowIdx >= 0 && <span>{t('a_kt_bottleneck')} <b>{t(stages[slowIdx].k)}</b></span>}
      </div>
      <p className="an-foot">{t('a_kt_sample').replace('{n}', String(d.sampleOrders))}</p>
    </>
  );
}

/* ---- Paid revenue by recorded staff payment method ---- */
function PaymentSplitCard({ rows, t }: { rows: PaymentMethodRevenue[]; t: T }) {
  const cash = rows.find((r) => r.method === 'CASH');
  const card = rows.find((r) => r.method === 'CARD');
  const cashRevenue = Number(cash?.revenue ?? 0);
  const cardRevenue = Number(card?.revenue ?? 0);
  const total = cashRevenue + cardRevenue;
  if (total <= 0) return <p className="an-empty">{t('a_noData')}</p>;
  const cashPct = Math.round((cashRevenue / total) * 100);
  const legs = [
    { k: t('a_cash'), c: 'var(--amber)', rev: cashRevenue, n: cash?.paymentCount ?? 0, pct: cashPct },
    { k: t('a_card'), c: 'var(--accent-text)', rev: cardRevenue, n: card?.paymentCount ?? 0, pct: 100 - cashPct },
  ];
  return (
    <>
      <div className="an-stack" role="img" aria-label={`${t('a_cash')} ${cashPct}%`}>
        {legs.map((l) => <div key={l.k} className="an-stack-seg" style={{ flex: Math.max(l.pct, 0.001), background: l.c }} />)}
      </div>
      <table className="an-tbl">
        <tbody>
          {legs.map((l) => (
            <tr key={l.k}>
              <td className="name"><span className="an-key" style={{ background: l.c }} />{l.k}</td>
              <td className="n q">{l.n} {t('a_transactions')}</td>
              <td className="n">{omr(l.rev)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="an-foot">{t('a_paymentHint')}</p>
    </>
  );
}

/* ---- Searchable, paged customer directory ---- */
function CustomerDirectoryTable({ data, loading, search, page, lang, t, onSearch, onSubmit, onPage, onBack }: {
  data?: PageResponse<CustomerDirectoryRow>; loading: boolean; search: string; page: number; lang: string; t: T;
  onSearch: (value: string) => void; onSubmit: () => void; onPage: (page: number) => void; onBack: () => void;
}) {
  return (
    <section className="an-block">
      <div className="an-block-hd">
        <h3>{t('a_customerDirectory')} <small>{data?.totalElements ?? 0}</small></h3>
        <button className="an-btn" onClick={onBack}>← {t('a_backInsights')}</button>
      </div>
      <form className="an-directory-search" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
        <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder={t('a_searchCustomers')} />
        <button type="submit" className="an-btn primary">{t('a_search')}</button>
      </form>
      {loading ? <div className="an-skel card" /> : !data?.content.length ? <p className="an-empty">{t('a_noData')}</p> : (
        <>
          <div className="an-tbl-wrap">
            <table className="an-tbl dir">
              <thead><tr><th>{t('a_name')}</th><th>{t('a_phone')}</th><th className="n">{t('a_orders')}</th><th className="n">{t('a_lastOrder')}</th></tr></thead>
              <tbody>
                {data.content.map((customer) => (
                  <tr key={customer.phone}>
                    <td className="name">{customer.name || '—'}</td>
                    <td><a href={`tel:${customer.phone}`} dir="ltr">{customer.phone}</a></td>
                    <td className="n">{customer.orderCount}</td>
                    <td className="n q">{customer.lastOrderAt
                      ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(customer.lastOrderAt))
                      : t('a_never')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="an-pager">
            <button disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous">‹</button>
            <span>{page + 1} / {Math.max(1, data.totalPages)}</span>
            <button disabled={data.last} onClick={() => onPage(page + 1)} aria-label="Next">›</button>
          </div>
        </>
      )}
    </section>
  );
}

/* ---- Customer base — repeat rate, frequency, new vs returning split ---- */
function CustomerBaseCard({ d, t }: { d: CustomerBase; t: T }) {
  const reduce = useReducedMotion();
  const repeatShare = Math.min(100, Math.max(0, d.repeatOrderSharePercent));
  return (
    <div className="an-cb">
      <div>
        <div className="an-cb-rate">
          <span className="an-cb-pct">{d.repeatRatePercent}<small>%</small></span>
          <span className="an-cb-rate-lbl">{t('a_cb_repeat')}</span>
        </div>
        <p className="an-cb-sub">{t('a_cb_repeatSub').replace('{r}', String(d.repeatCustomers)).replace('{n}', String(d.totalCustomers))}</p>
      </div>
      <div className="an-cb-stats">
        <div className="an-cb-stat"><b>{d.avgOrdersPerCustomer.toFixed(1)}</b><small>{t('a_cb_avg')}</small></div>
        <div className="an-cb-stat"><b>{d.newCustomers}</b><small>{t('a_cb_new')}</small></div>
        <div className="an-cb-stat"><b>{d.activeCustomers}</b><small>{t('a_cb_active')}</small></div>
      </div>
      <div className="an-cb-split">
        <div className="an-cb-split-bar">
          <motion.div className="an-cb-split-fill" style={{ width: `${repeatShare}%` }}
            initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }}
            transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }} />
        </div>
        <div className="an-cb-split-legend">
          <span>{t('a_cb_returningOrders')} {repeatShare}%</span>
          <span>{t('a_cb_newOrders')} {100 - repeatShare}%</span>
        </div>
      </div>
    </div>
  );
}

/* ---- Benchmark row — parked with the benchmark card above ---- */
function BenchRow({ label, you, median, pct, t }: { label: string; you: string; median: string; pct: number; t: T }) {
  return (
    <div className="an-meter-row">
      <span className="an-meter-lbl">{label}</span>
      <span className="an-meter-track"><span className="an-meter-fill" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} /></span>
      <span className="an-meter-val">{you} <small>/ {median} {t('a_median')}</small></span>
    </div>
  );
}

/* ---- pro upsell (shown on locked tabs / cards) ---- */
function ProUpsell({ desc, tags, t }: { desc: string; tags: string[]; t: T }) {
  return (
    <div className="an-lock">
      <div className="an-lock-body">
        <b>{t('a_lockTitle')}</b>
        <p>{desc}</p>
        <div className="an-lock-tags">{tags.map((x) => <span key={x}>{x}</span>)}</div>
      </div>
      <button className="an-btn primary">{t('a_lockCta')} →</button>
    </div>
  );
}

/* ---- error card ---- */
function ErrCard({ message, onRetry, t }: { message: string; onRetry: () => void; t: T }) {
  return (
    <div className="an-errcard">
      <p>{message}</p>
      <button className="an-btn" onClick={onRetry}>{t('a_retry')}</button>
    </div>
  );
}

/* ---- loading skeleton ---- */
function Skeleton({ cards }: { cards?: number }) {
  if (cards) {
    return (
      <div className="an-cols" aria-hidden>
        {Array.from({ length: cards }).map((_, i) => <div key={i} className="an-skel card" />)}
      </div>
    );
  }
  return (
    <div className="an-skel-wrap" aria-hidden>
      <div className="an-skel ledger" />
      <div className="an-skel panel" />
      <div className="an-cols">
        <div className="an-skel card" />
        <div className="an-skel card" />
      </div>
    </div>
  );
}
