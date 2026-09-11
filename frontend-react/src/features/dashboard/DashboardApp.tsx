import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, logout, changeEmail, streamTicket, onAuthChange, syncUser, endImpersonation, getImpersonation } from '../../lib/api';
import { useAuth, isManager, canAcceptOrders, can } from '../../lib/auth';
import { useI18n, useT, nameOf, personName, Ltr, ltrText, type Dict } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import { useConfirm } from '../../lib/confirm';
import { useOrderStream, type StreamStatus } from '../../lib/sse';
import { isPrintStation, setPrintStation, canPrintHere, getStationId, rememberPrinted, forgetPrinted, printedButUnacked } from '../../lib/printer';
import { useOrderSound, SoundToggle, notify, closeNotify } from '../../lib/alerts';
import { useWakeLock } from '../../lib/wakeLock';
import { fmtElapsed, omr } from '../../lib/format';
import { Money } from '../../lib/Money';
import { carColorOf } from '../../lib/carColors';
import { useSkin } from '../../lib/skin';
import ReceiptCapture, { type PendingReceipt, type ReceiptOutput } from './ReceiptCapture';
import { ReceiptPrinterProvider, useReceiptPrinter, type PrintOptions } from './receiptPrinter';
import type { OrderResponse, OrderStatus, BranchResponse, TableResponse, Restaurant, QrActivity, QrCartItem, PrintJobResponse, EnqueueResponse, StationStatus, PaymentTender } from '../../lib/types';
import { BRAND } from '../../lib/brand';
import { ensureGoogleFonts, BOLD_FONTS } from '../../lib/fonts';
import { useFeatures } from '../../lib/plan';
import { BrandedQrCode, loadQrStyle, resolveQrStyle, DEFAULT_QR_STYLE, QR_FONT_GOOGLE, type QrBadgeStyle } from './qrStyle';
import Login from '../auth/Login';
import MenuManager from './MenuManager';
import OrdersPage from './OrdersPage';
import SettingsPage, { type SettingsSection } from './SettingsPage';
import TeamPage from './TeamPage';
// Analytics pulls in recharts + motion (~150KB gzipped), so code-split it — staff on the
// live board never download those bytes unless they open the analytics tab.
const AnalyticsPage = lazy(() => import('./AnalyticsPage'));
import OrderPad from './OrderPad';
import LoyaltyPage from './LoyaltyPage';
import StockPage from './stock/StockPage';
import './dashboard.css';
import './settings.css';

const DICT: Dict = {
  ar: { title: 'شاشة المطبخ', live: 'مباشر', logoutT: 'خروج', cur: 'ر.ع', min: 'د', empty: 'لا طلبات',
        nav_board: 'الطلبات المباشرة', nav_tables: 'الطاولات ورموز QR', nav_orders: 'سجل الطلبات', nav_menu: 'إدارة القائمة', nav_look: 'شكل قائمة العملاء', nav_team: 'الفريق', nav_analytics: 'التحليلات', nav_neworder: 'طلب جديد', nav_profile: 'ملف المطعم', nav_loyalty: 'الولاء', nav_loyaltySetup: 'إعدادات الولاء', nav_stock: 'المخزون', nav_settings: 'الإعدادات', more: 'المزيد', beta: 'تجريبي',
        col_PENDING: 'جديد', col_ACCEPTED: 'قيد التنفيذ', col_PREPARING: 'قيد التحضير', col_READY: 'جاهز',
        table: 'طاولة', car: 'خدمة السيارة', note: 'ملاحظة', loyaltyReward: 'مكافأة ولاء',
        paymentTitle: 'كيف دفع العميل؟', paymentSub: 'اختر طريقة الدفع قبل إنهاء الطلب.', paymentCash: 'نقداً', paymentCard: 'بطاقة / فيزا',
        paymentSplit: 'تقسيم', splitTitle: 'تقسيم الفاتورة', splitSub: 'سجّل حصة كل شخص وكيف دفعها.',
        splitPeople: 'عدد الأشخاص', splitEach: 'لكل شخص', splitPerson: 'شخص', splitMore: 'أكثر',
        splitRemaining: 'المتبقي', splitExtra: 'زيادة عن الإجمالي', splitSettle: 'تسجيل الدفع',
        accept: 'قبول', decline: 'رفض', startPrep: 'بدء التحضير', ready: 'جاهز', complete: 'اكتمل', cancel: 'إلغاء',
        collect: 'حصّل', done: 'تم', doneUnpaid: 'تم دون دفع',
        unpaid: 'تحديد كمدفوع', paid: 'مدفوع', confirm: 'تأكيد', back: 'رجوع',
        acceptT: 'قبول الطلب', acceptP: 'كم دقيقة للتحضير؟', declineT: 'رفض الطلب', declineP: 'سبب الرفض (اختياري، يظهر للعميل)',
        cancelT: 'إلغاء الطلب', cancelP: 'سبب الإلغاء (اختياري)', reason: 'السبب',
        tablesTitle: 'الطاولات ورموز QR', addTable: '＋ طاولة', tableNumber: 'رقم الطاولة', add: 'إضافة',
        sentToStation: 'أُرسلت إلى طابعة الكاونتر', sentToStationFailed: 'تعذّر إرسالها إلى طابعة الكاونتر',
        noStationCollecting: 'حُفظت، لكن لا يوجد جهاز كاونتر يستقبل الطباعة الآن',
        printerAlarm: 'لا أحد يجمع الطباعة', printerAlarmHint: 'تذاكر بانتظار الطباعة ولا يوجد جهاز يجمعها. افتح Serva أو تطبيق Serva Station على جهاز الطباعة بجانب الطابعة.',
        printerStuck: 'الطابعة لا تطبع', printerStuckHint: 'جهاز الطباعة يعمل لكن الطابعة لا تستجيب له. تأكد أن الطابعة مشغّلة وفيها ورق وعلى شبكة WiFi نفسها.',
        print: 'طباعة الكل', printOne: 'طباعة الرمز', printInv: 'طباعة الفاتورة', regenerate: 'تجديد الرمز', del: 'حذف', scan: 'امسح للطلب', copy: 'نسخ الرابط', copied: 'تم النسخ', carQr: 'رمز سيارات الخارج',
        qrStyleLink: 'تخصيص رمز QR',
        noTables: 'لا توجد طاولات بعد', regenWarn: 'سيتوقف الرمز القديم عن العمل. متابعة؟', delWarn: 'حذف هذه الطاولة؟',
        syncing: 'مزامنة الطلبات', autoRefresh: 'التحديث التلقائي يعمل', newOrder: 'طلب جديد', newOrders: 'طلبات جديدة', tapView: 'اضغط للعرض',
        loginTitle: 'لوحة Serva.', loginSub: 'سجّل الدخول لإدارة الطلبات المباشرة', saved: 'تم الحفظ',
        orderingNow: 'يطلبون الآن', qaNow: 'الآن', qaToday: 'اليوم', qaOrders: 'طلب',
        qaLive: 'سلات نشطة', qaViewing: 'يتصفح', qaOrdering: 'في السلة الآن', qaCart: 'الأصناف',
        qaCartHint: 'محتوى السلة الآن — قد يتغير قبل إرسال الطلب',
        account: 'الحساب', email: 'البريد', language: 'اللغة', branch: 'الفرع', arabic: 'العربية', english: 'English', changePassword: 'تغيير كلمة المرور', changeEmail: 'تغيير البريد الإلكتروني',
        ordersOpen: 'يستقبل الطلبات', ordersPaused: 'الطلبات متوقفة', pauseOrders: 'إيقاف الطلبات', resumeOrders: 'استئناف الطلبات',
        pauseTitle: 'إيقاف طلبات العملاء؟', pauseMessage: 'سيتمكن العملاء من تصفح القائمة، لكن لن يتمكنوا من إضافة أصناف أو إرسال طلب جديد لهذا الفرع.', pauseConfirm: 'إيقاف الطلبات',
        ordersPausedToast: 'تم إيقاف طلبات العملاء', ordersResumedToast: 'تم استئناف طلبات العملاء',
        changePwSub: 'أدخل كلمة المرور الحالية ثم الجديدة.', currentPw: 'كلمة المرور الحالية',
        changeEmailSub: 'أدخل كلمة المرور الحالية والبريد الجديد.', newEmail: 'البريد الجديد',
        newPw: 'كلمة المرور الجديدة', confirmPw: 'تأكيد كلمة المرور', save: 'حفظ',
        pwChanged: 'تم تغيير كلمة المرور', pwTooShort: 'كلمة المرور 8 أحرف على الأقل', pwMismatch: 'كلمتا المرور غير متطابقتين',
        emailChanged: 'تم تغيير البريد الإلكتروني', emailInvalid: 'أدخل بريدًا صحيحًا',
        role_owner: 'مالك المطعم', role_staff: 'موظف' },
  en: { title: 'Kitchen Display', live: 'Live', logoutT: 'Logout', cur: 'OMR', min: 'min', empty: 'No orders',
        nav_board: 'Live orders', nav_tables: 'Tables & QR', nav_orders: 'Order history', nav_menu: 'Menu', nav_look: 'Customer menu look', nav_team: 'Team', nav_analytics: 'Analytics', nav_neworder: 'New order', nav_profile: 'Restaurant profile', nav_loyalty: 'Loyalty', nav_loyaltySetup: 'Loyalty settings', nav_stock: 'Stock', nav_settings: 'Settings', more: 'More', beta: 'Beta',
        col_PENDING: 'New', col_ACCEPTED: 'In progress', col_PREPARING: 'Preparing', col_READY: 'Ready',
        table: 'Table', car: 'Outdoor car', note: 'Note', loyaltyReward: 'Loyalty reward',
        paymentTitle: 'How did the customer pay?', paymentSub: 'Choose the payment method before completing the order.', paymentCash: 'Cash', paymentCard: 'Card / Visa',
        paymentSplit: 'Split', splitTitle: 'Split the bill', splitSub: "Record each person's share and how they paid.",
        splitPeople: 'People', splitEach: 'Each', splitPerson: 'Person', splitMore: 'More',
        splitRemaining: 'Remaining', splitExtra: 'Over the total', splitSettle: 'Record payment',
        accept: 'Accept', decline: 'Decline', startPrep: 'Start preparing', ready: 'Ready', complete: 'Complete', cancel: 'Cancel',
        collect: 'Collect', done: 'Done', doneUnpaid: 'Done, unpaid',
        unpaid: 'Mark paid', paid: 'Paid', confirm: 'Confirm', back: 'Back',
        acceptT: 'Accept order', acceptP: 'How many minutes to prepare?', declineT: 'Decline order', declineP: 'Reason (optional, shown to customer)',
        cancelT: 'Cancel order', cancelP: 'Cancel reason (optional)', reason: 'Reason',
        tablesTitle: 'Tables & QR codes', addTable: '＋ Table', tableNumber: 'Table number', add: 'Add',
        sentToStation: 'Sent to the counter printer', sentToStationFailed: 'Could not reach the counter printer',
        noStationCollecting: 'Saved, but no counter device is collecting prints right now',
        printerAlarm: 'Nobody collecting prints', printerAlarmHint: 'Tickets are waiting and no device is collecting them. Open Serva, or the Serva Station app, on the device next to the printer.',
        printerStuck: 'Printer not printing', printerStuckHint: 'The print station is running but the printer is not answering it. Check the printer is switched on, has paper, and is on the same WiFi.',
        print: 'Print all', printOne: 'Print QR', printInv: 'Print invoice', regenerate: 'Regenerate', del: 'Delete', scan: 'Scan to order', copy: 'Copy link', copied: 'Copied', carQr: 'Outdoor car QR',
        qrStyleLink: 'Customize QR',
        noTables: 'No tables yet', regenWarn: 'The old QR will stop working. Continue?', delWarn: 'Delete this table?',
        syncing: 'Syncing orders', autoRefresh: 'Auto-refresh on', newOrder: 'New order', newOrders: 'new orders', tapView: 'Tap to view',
        loginTitle: 'Serva. dashboard', loginSub: 'Sign in to manage live orders', saved: 'Saved',
        orderingNow: 'ordering now', qaNow: 'now', qaToday: 'Today', qaOrders: 'orders',
        qaLive: 'Active carts', qaViewing: 'Viewing', qaOrdering: 'in cart now', qaCart: 'Items',
        qaCartHint: 'In their cart right now — may change before the order is placed',
        account: 'Account', email: 'Email', language: 'Language', branch: 'Branch', arabic: 'Arabic', english: 'English', changePassword: 'Change password', changeEmail: 'Change email',
        ordersOpen: 'Accepting orders', ordersPaused: 'Orders paused', pauseOrders: 'Pause orders', resumeOrders: 'Resume orders',
        pauseTitle: 'Pause customer orders?', pauseMessage: 'Customers can still browse the menu, but they cannot add items or submit a new order for this branch.', pauseConfirm: 'Pause orders',
        ordersPausedToast: 'Customer orders paused', ordersResumedToast: 'Customer orders resumed',
        changePwSub: 'Enter your current password, then a new one.', currentPw: 'Current password',
        changeEmailSub: 'Enter your current password and new email.', newEmail: 'New email',
        newPw: 'New password', confirmPw: 'Confirm new password', save: 'Save',
        pwChanged: 'Password changed', pwTooShort: 'Use at least 8 characters', pwMismatch: 'Passwords don’t match',
        emailChanged: 'Email changed', emailInvalid: 'Enter a valid email',
        role_owner: 'Owner', role_staff: 'Staff' },
};

const COLS: { st: OrderStatus; color: string }[] = [
  { st: 'PENDING', color: 'var(--pending)' },
  { st: 'ACCEPTED', color: 'var(--accepted)' },
  { st: 'READY', color: 'var(--ready)' },
];
// statuses that belong on the live board; anything else has left it (completed/cancelled)
const LIVE_SET = new Set<OrderStatus>(['PENDING', 'ACCEPTED', 'READY']);

export default function DashboardApp() {
  const { user, authed } = useAuth();
  const t = useT(DICT);
  useEffect(() => { ensureGoogleFonts(BOLD_FONTS); }, []);
  // Permissions may have been edited since login; pick them up on every dashboard load.
  useEffect(() => { if (authed) syncUser(); }, [authed]);
  if (!authed || !user) {
    return <Login mark={BRAND.name} title={t('loginTitle')} subtitle={t('loginSub')} />;
  }
  if (can(user, 'PLATFORM_ADMIN')) {
    return <Navigate to="/admin" replace />;
  }
  return (
    <>
      <SupportSessionBanner />
      <Shell />
    </>
  );
}

/**
 * The way out of a support session.
 *
 * A platform admin viewing a café is holding a borrowed 30-minute session, and without a
 * standing reminder it is genuinely easy to forget whose dashboard you are typing into. The
 * bar names the café, counts the session down, and puts the admin back with one click.
 */
function SupportSessionBanner() {
  const navigate = useNavigate();
  const [imp] = useState(() => getImpersonation());
  // Only the countdown changes each second. Keeping the session itself out of the ticking
  // state is what stops the effect from tearing its own timer down every tick.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!imp) return;
    // Tick once a second so the remaining time is honest, and leave by ourselves the moment
    // it runs out rather than waiting for the next request to fail.
    const id = window.setInterval(() => {
      setNow(Date.now());
      if (!getImpersonation()) navigate('/admin', { replace: true });
    }, 1000);
    return () => window.clearInterval(id);
  }, [imp, navigate]);

  if (!imp) return null;
  const secondsLeft = Math.max(0, Math.round((imp.expiresAt - now) / 1000));
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div className="supportbar" role="status">
      <span className="sb-dot" />
      <span className="sb-txt">
        <strong>{imp.restaurantName}</strong>
        <span className="sb-user" dir="ltr">{imp.username}</span>
      </span>
      <span className="sb-clock num">{mm}:{ss}</span>
      <button className="sb-exit" onClick={() => { endImpersonation(); navigate('/admin', { replace: true }); }}>
        ✕
      </button>
    </div>
  );
}

/* Menu look, the restaurant profile and loyalty setup used to be pages of their own (two of
   them reachable only from the avatar dropdown, which is a "who am I" affordance nobody
   opens looking for a VAT rate). They're now sections inside `settings`. */
type Page = 'board' | 'neworder' | 'orders' | 'menu' | 'team' | 'analytics' | 'tables' | 'loyalty' | 'stock' | 'settings';
/** The URL owns the active page (/dashboard/<page>, /dashboard/settings/<section>), so an
    incoming path segment is validated against this list before we trust it. */
const PAGES: Page[] = ['board', 'neworder', 'orders', 'menu', 'team', 'analytics', 'tables', 'loyalty', 'stock', 'settings'];

function LivePill({ stream, t }: { stream: StreamStatus; t: (k: string) => string }) {
  if (stream === 'open') {
    return <span className="dlive"><span className="d" />{t('live')}</span>;
  }
  if (stream === 'connecting') {
    return <span className="dlive sync"><span className="d" />{t('syncing')}</span>;
  }
  return <span className="dlive fallback"><span className="d" />{t('autoRefresh')}</span>;
}

/* Reconnects normally complete in under a second — only show a degraded pill state
   when it actually persists, so routine stream recycles never flicker the UI. */
function useCalmStream(stream: StreamStatus, delayMs = 5_000): StreamStatus {
  const [shown, setShown] = useState(stream);
  useEffect(() => {
    if (stream === 'open') { setShown('open'); return; }
    const id = window.setTimeout(() => setShown(stream), delayMs);
    return () => window.clearTimeout(id);
  }, [stream, delayMs]);
  return shown;
}

/* The live order stream + new-order alerts live at the Shell level — NOT inside the
   board — so a new order rings, buzzes and notifies on EVERY tab (menu, analytics,
   team…), not only while the kitchen display happens to be open. The board just reads
   the same react-query cache this stream keeps warm.
   Returns the connection status (for the live pill), the unacknowledged count (for the
   shell banner) and a clear(). */
function useLiveOrderAlerts(branchId: number | undefined, ping: () => void, t: (k: string) => string) {
  const qc = useQueryClient();
  const liveKey = ['live', branchId ?? 'all'];
  const [stream, setStream] = useState<StreamStatus>('connecting');
  const [unacked, setUnacked] = useState(0);
  const lastFallbackRefresh = useRef(0);
  const prevStreamStatus = useRef<StreamStatus | null>(null);

  /* EventSource can't send a header, so the credential rides in the URL — which is why it is
     a stream ticket and not the access token it used to be: opaque, minutes long, and no use
     against anything but a stream. It also can't change its URL on auto-reconnect, so a new
     ticket is fetched whenever the session changes or the stream drops, and the new URL is
     what makes the effect reconnect. */
  const [ticket, setTicket] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => { streamTicket().then((tk) => { if (live) setTicket(tk); }); };
    load();
    const off = onAuthChange(load);
    return () => { live = false; off(); };
  }, []);
  const streamUrl = branchId && ticket
    ? `/api/dashboard/orders/stream?branchId=${branchId}&ticket=${encodeURIComponent(ticket)}`
    : null;

  const handleStreamStatus = (status: StreamStatus) => {
    setStream(status);
    const prev = prevStreamStatus.current;
    prevStreamStatus.current = status;
    if (status === 'open') {
      // Back after a real drop → resync once; events from the gap never replay on their own.
      if (prev === 'reconnecting') qc.invalidateQueries({ queryKey: liveKey });
      return;
    }
    const now = Date.now();
    if (now - lastFallbackRefresh.current > 5_000) {
      lastFallbackRefresh.current = now;
      qc.invalidateQueries({ queryKey: liveKey });
      // An expired ticket is the other common drop cause — swap in a fresh one.
      streamTicket().then((tk) => { if (tk) setTicket((p) => (tk !== p ? tk : p)); });
    }
  };

  useOrderStream(
    streamUrl,
    (name, data) => {
      // Apply the payload straight to the cache so the board (when open) updates instantly.
      const o = data as OrderResponse | null;
      if (o && typeof o.id === 'number') {
        const updated = qc.setQueryData<OrderResponse[]>(liveKey, (prev = []) => {
          const rest = prev.filter((x) => x.id !== o.id);
          if (!LIVE_SET.has(o.status)) return rest; // moved to a terminal status → drop
          return [...rest, o].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
        });
        // If an order left the live set and nothing is left pending, clear the badge.
        if (!LIVE_SET.has(o.status) && (updated?.length ?? 0) === 0) setUnacked(0);
      } else {
        qc.invalidateQueries({ queryKey: liveKey });
      }
      // An order moving is the shelf moving: accepted draws, cancelled restores. Refetch what
      // reads the shelf so the wall and the pad's sold-out tiles never sit a poll behind.
      qc.invalidateQueries({ queryKey: ['stock', branchId] });
      qc.invalidateQueries({ queryKey: ['stock-usage', branchId] });
      qc.invalidateQueries({ queryKey: ['pad-menu'] });
      if (name === 'order.created') {
        ping();
        setUnacked((n) => n + 1);
        notify(t('newOrder'), o?.dailyNumber ? `#${o.dailyNumber}` : '');
        // The print station pulls its queue on a 5s poll; the arrival event is the cue to
        // pull now, so a counter ticket prints as the order lands rather than up to 5s later.
        // A no-op on any device that is not the station: its query is disabled.
        qc.invalidateQueries({ queryKey: ['print-jobs', branchId] });
      }
    },
    handleStreamStatus,
  );

  // flash the tab title with the unread count when the dashboard is in the background
  useEffect(() => {
    document.title = unacked > 0 ? `(${unacked}) ${t('newOrder')} — Serva.` : 'Serva.';
    return () => { document.title = 'Serva.'; };
  }, [unacked, t]);
  useEffect(() => { if (unacked === 0) closeNotify(); }, [unacked]);
  useEffect(() => {
    const onVis = () => { if (!document.hidden) setUnacked(0); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Keep ringing every ~12s while new orders sit unacknowledged (staff stepped away),
  // stopping the moment they're acknowledged / the tab refocuses — capped so it never nags forever.
  useEffect(() => {
    if (unacked <= 0) return;
    let rings = 0;
    const id = setInterval(() => {
      if (++rings > 5) { clearInterval(id); return; }
      ping();
    }, 12_000);
    return () => clearInterval(id);
  }, [unacked > 0, ping]); // eslint-disable-line react-hooks/exhaustive-deps

  return { stream, unacked, clear: useCallback(() => setUnacked(0), []) };
}

/* Monochrome line icons (Lucide-style) for the rail. Drawn inline so we add no
   icon dependency, and stroked with currentColor so — unlike the old emoji — they
   pick up the rail's muted / hover / active-ink states (incl. ink-on-lime in the
   neo theme). Sized in `em` so they ride the button font-size (rail 20px, bottom
   nav 19px). */
function Ico({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="1.15em" height="1.15em" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      {children}
    </svg>
  );
}
const IcLive = () => <Ico><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5Z" /></Ico>;
const IcNew = () => <Ico><path d="M12 5v14M5 12h14" /></Ico>;
const IcHistory = () => <Ico><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" /><path d="M14 8H8M16 12H8M13 16H8" /></Ico>;
const IcAnalytics = () => <Ico><path d="M3 3v18h18" /><path d="M18 17V9M13 17V5M8 17v-3" /></Ico>;
const IcMenu = () => <Ico><path d="M12 7v14" /><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" /></Ico>;
const IcTables = () => <Ico><rect width="5" height="5" x="3" y="3" rx="1" /><rect width="5" height="5" x="16" y="3" rx="1" /><rect width="5" height="5" x="3" y="16" rx="1" /><path d="M21 16h-3a2 2 0 0 0-2 2v3M21 21v.01M12 7v3a2 2 0 0 1-2 2H7M3 12h.01M12 3h.01M12 16v.01M16 12h1M21 12v.01M12 21v-1" /></Ico>;
const IcTeam = () => <Ico><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></Ico>;
const IcPower = () => <Ico><path d="M12 2v10M18.4 6.6a9 9 0 1 1-12.77.04" /></Ico>;
const IcStock = () => <Ico><path d="M3 8h18v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /><path d="M2 4h20v4H2z" /><path d="M10 12h4" /></Ico>;
const IcLoyalty = () => <Ico><path d="M12 2l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20l1.1-6.5L2.6 8.8l6.5-.9z" /></Ico>;
const IcSettings = () => <Ico><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></Ico>;
const IcMore = () => <Ico><rect width="7" height="7" x="3" y="3" rx="1.5" /><rect width="7" height="7" x="14" y="3" rx="1.5" /><rect width="7" height="7" x="14" y="14" rx="1.5" /><rect width="7" height="7" x="3" y="14" rx="1.5" /></Ico>;

function Shell() {
  const { user } = useAuth();
  const t = useT(DICT);
  const toast = useToast();
  const confirm = useConfirm();
  // The URL is the source of truth for what's on screen, so every tab is deep-linkable, the
  // browser back button works, and an owner can send a staff member a link straight to the
  // stock page. DashboardApp is mounted at /dashboard/* (see App.tsx), so we own everything
  // past that prefix: /dashboard/<page> and /dashboard/settings/<section>.
  const location = useLocation();
  const navigate = useNavigate();
  const [urlPage, urlSection] = useMemo(() => {
    const segs = location.pathname.replace(/^\/dashboard\/?/, '').split('/').filter(Boolean);
    return [segs[0] as Page | undefined, segs[1] as SettingsSection | undefined];
  }, [location.pathname]);
  const page: Page = urlPage && PAGES.includes(urlPage) ? urlPage : 'board';
  const go = useCallback(
    (p: Page, opts?: { replace?: boolean }) => navigate(`/dashboard/${p}`, { replace: opts?.replace ?? false }),
    [navigate],
  );
  const setPage = go;
  // Section changes replace rather than push — clicking through seven settings panes
  // shouldn't bury the page the owner came from under seven back-button presses.
  const setSection = useCallback(
    (s: SettingsSection) => navigate(`/dashboard/settings/${s}`, { replace: true }),
    [navigate],
  );

  // bumped on a banner tap so the (already-mounted) board jumps to the New column
  const [focusBoard, setFocusBoard] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const sound = useOrderSound();
  const titles: Record<string, string> = { board: t('title'), neworder: t('nav_neworder'), orders: t('nav_orders'), menu: t('nav_menu'), team: t('nav_team'), analytics: t('nav_analytics'), tables: t('tablesTitle'), loyalty: t('nav_loyalty'), stock: t('nav_stock'), settings: t('nav_settings') };

  // Ordered by daily workflow: run the floor (live → new → history), read the numbers
  // (analytics), then set things up (menu → stock → tables → team). Settings sits last —
  // it's a set-once destination, so it shouldn't compete with the operational tabs the way
  // the old top-level "Customer menu look" tab did.
  const navItems = ([
    { key: 'board', icon: <IcLive />, label: t('nav_board'), show: can(user, 'ORDERS') },
    { key: 'neworder', icon: <IcNew />, label: t('nav_neworder'), show: can(user, 'ORDERS') },
    { key: 'orders', icon: <IcHistory />, label: t('nav_orders'), show: can(user, 'ORDERS') },
    { key: 'analytics', icon: <IcAnalytics />, label: t('nav_analytics'), show: can(user, 'ANALYTICS') },
    { key: 'loyalty', icon: <IcLoyalty />, label: t('nav_loyalty'), show: can(user, 'PROFILE') },
    { key: 'menu', icon: <IcMenu />, label: t('nav_menu'), show: can(user, 'MENU') },
    // Next to the menu because that is the pair an owner sets up together: what you sell,
    // and what you need in the room to sell it.
    { key: 'stock', icon: <IcStock />, label: t('nav_stock'), show: can(user, 'STOCK') },
    { key: 'tables', icon: <IcTables />, label: t('nav_tables'), show: can(user, 'QR_TABLES') },
    { key: 'team', icon: <IcTeam />, label: t('nav_team'), show: can(user, 'TEAM') },
    // Always shown: SettingsPage gates its own sections, and Appearance is available to
    // everyone — a barista who prefers the quieter skin can switch it themselves.
    { key: 'settings', icon: <IcSettings />, label: t('nav_settings'), show: true },
  ] as { key: Page; icon: ReactNode; label: string; show: boolean; beta?: boolean }[]).filter((i) => i.show);

  // Phone bottom bar holds at most 5 items; anything past that moves into a "More" sheet so
  // touch targets stay big and nothing hides off-screen. Few-permission staff keep all tabs.
  const BOTTOM_MAX = 5;
  const hasOverflow = navItems.length > BOTTOM_MAX;
  const primaryNav = hasOverflow ? navItems.slice(0, BOTTOM_MAX - 1) : navItems;
  const overflowNav = hasOverflow ? navItems.slice(BOTTOM_MAX - 1) : [];
  const moreActive = overflowNav.some((i) => i.key === page);

  // Land on the first screen the user can actually open (e.g. a kitchen-only or menu-only member).
  const navKeys = navItems.map((i) => i.key).join(',');
  useEffect(() => {
    if (navItems.length && !navItems.some((i) => i.key === page)) go(navItems[0].key, { replace: true });
  }, [navKeys, page]); // eslint-disable-line

  const qc = useQueryClient();
  const branchesQ = useQuery({
    queryKey: ['branches', user!.restaurantId],
    queryFn: () => api.get<any>(`/api/restaurants/${user!.restaurantId}/branches`),
    enabled: isManager(user) && !!user!.restaurantId,
  });
  const branchesRaw = branchesQ.data;
  const branches: BranchResponse[] = Array.isArray(branchesRaw) ? branchesRaw : branchesRaw?.content ?? [];
  // A branch an admin has deactivated must vanish from the owner's switcher and never be the
  // working branch — customers can't reach it, so the owner shouldn't be parked on it either.
  const activeBranches = useMemo(() => branches.filter((b) => b.active), [branches]);

  // Staff assigned to one shop work in that shop, full stop. The server pins every list to
  // their branch whatever the client asks for, so a switcher here could only ever lie.
  const pinnedBranch = user!.branchId ?? undefined;
  const [branchId, setBranchId] = useState<number | undefined>(pinnedBranch);
  // Keep the working branch on an active one: pick the first active branch when we have none yet
  // or when the branch we were on just got deactivated. Never for pinned staff — moving them to
  // somebody else's shop would put a branch name on screen above their own branch's numbers.
  useEffect(() => {
    if (pinnedBranch != null || !activeBranches.length) return;
    if (branchId == null || !activeBranches.some((b) => b.id === branchId)) setBranchId(activeBranches[0].id);
  }, [activeBranches]); // eslint-disable-line

  const selectedBranchQ = useQuery({
    queryKey: ['branch', branchId],
    queryFn: () => api.get<BranchResponse>(`/api/branches/${branchId}`),
    enabled: branchId != null,
  });
  const selectedBranch = selectedBranchQ.data ?? activeBranches.find((b) => b.id === branchId);
  const orderingStatus = useMutation({
    mutationFn: ({ id, acceptingOrders }: { id: number; acceptingOrders: boolean }) =>
      api.patch<BranchResponse>(`/api/branches/${id}/ordering-status`, { acceptingOrders }),
    onSuccess: (updated) => {
      qc.setQueryData(['branch', updated.id], updated);
      qc.setQueryData(['branches', user!.restaurantId], (previous: any) => {
        if (Array.isArray(previous)) {
          return previous.map((branch) => branch.id === updated.id ? updated : branch);
        }
        if (Array.isArray(previous?.content)) {
          return { ...previous, content: previous.content.map((branch: BranchResponse) => branch.id === updated.id ? updated : branch) };
        }
        return previous;
      });
      toast(t(updated.acceptingOrders ? 'ordersResumedToast' : 'ordersPausedToast'));
    },
    onError: (error) => toast(error instanceof ApiError ? error.message : 'Error'),
  });
  const toggleOrdering = async () => {
    if (!selectedBranch || orderingStatus.isPending) return;
    const next = !selectedBranch.acceptingOrders;
    if (!next) {
      const accepted = await confirm({
        title: t('pauseTitle'),
        message: t('pauseMessage'),
        confirmLabel: t('pauseConfirm'),
        cancelLabel: t('back'),
        danger: true,
      });
      if (!accepted) return;
    }
    orderingStatus.mutate({ id: selectedBranch.id, acceptingOrders: next });
  };

  // Self-heal: a café onboarded before branches were auto-created has none — and without one
  // the Tables & QR page is dead. When an owner lands here with zero branches, provision a
  // default branch (named after the café) so QR codes work immediately.
  const canMakeBranch = can(user, 'BRANCHES');
  const needsBranch = canMakeBranch && branchesQ.isSuccess && branches.length === 0;
  // Always warm (not just when needsBranch) — the print-station listener below needs the
  // restaurant's name/phone/VAT settings for the receipt, on every tab, not only onboarding.
  const restaurantQ = useQuery({
    queryKey: ['restaurant', user!.restaurantId],
    queryFn: () => api.get<Restaurant>(`/api/restaurants/${user!.restaurantId}`),
    enabled: !!user!.restaurantId,
  });
  // Seed the dashboard skin from the café's age the first time we know it: cafés that
  // existed before the professional skin shipped keep the original bold look, new signups
  // get 'pro'. No-op once the owner has picked a skin explicitly in Settings → Appearance.
  const { seedDefault } = useSkin();
  const restaurantCreatedAt = restaurantQ.data?.createdAt;
  useEffect(() => {
    if (restaurantCreatedAt) seedDefault(restaurantCreatedAt);
  }, [restaurantCreatedAt, seedDefault]);

  const madeBranchRef = useRef(false);
  // The auto-created first branch inherits the café's pair, so it is named in both languages
  // from the start rather than in whichever one happened to be filled.
  const makeBranch = useMutation({
    mutationFn: (r: Restaurant) => api.post<BranchResponse>(`/api/restaurants/${user!.restaurantId}/branches`,
      { name: r.name, nameEn: r.nameEn ?? null, nameAr: r.nameAr ?? null }),
    onSuccess: (b) => {
      qc.setQueryData(['branches', user!.restaurantId], (p: any) => (Array.isArray(p) ? [...p, b] : [b]));
      setBranchId(b.id);
    },
  });
  useEffect(() => {
    if (madeBranchRef.current || !needsBranch || !restaurantQ.data) return;
    madeBranchRef.current = true;
    makeBranch.mutate(restaurantQ.data);
  }, [needsBranch, restaurantQ.data]); // eslint-disable-line

  // Table numbers for the auto-print receipt (order carries only a raw tableId).
  const { data: printTablesRaw } = useQuery({
    queryKey: ['tables', branchId],
    queryFn: () => api.get<any>(`/api/branches/${branchId}/tables`),
    enabled: !!branchId,
  });
  const printTableNo = useMemo(() => {
    const list: TableResponse[] = Array.isArray(printTablesRaw) ? printTablesRaw : printTablesRaw?.content ?? [];
    return new Map(list.map((tb) => [tb.id, tb.tableNumber]));
  }, [printTablesRaw]);

  // FIFO of receipts awaiting capture — ReceiptCapture (mounted below) processes the head,
  // then onDone shifts. A queue rather than a single slot: two rapid prints must both come
  // out, not overwrite each other. Printing is device-local by design: RawBT is installed on
  // every staff device (all paired to the same WiFi printer), and whichever device completes
  // an order prints it right there — no cross-device forwarding.
  const [printQueue, setPrintQueue] = useState<PendingReceipt[]>([]);
  /* Hands the receipt to the branch's print station when this device has no printing app of
     its own. An iPad or a laptop used to tap 🖨 and get silence; now the paper comes out at
     the counter. PDF is exempt — it is a file for the person holding the device, not paper. */
  const delegate = useMutation({
    mutationFn: (o: OrderResponse) => api.post<EnqueueResponse>(`/api/dashboard/print-jobs?orderId=${o.id}`, {}),
    // The job is durable either way. The toast is about whether any device is collecting —
    // "sent to the printer" would be a lie in a café that never set a station up.
    onSuccess: (r) => toast(t(r.stationCollecting ? 'sentToStation' : 'noStationCollecting')),
    onError: (e) => toast(e instanceof ApiError ? e.message : t('sentToStationFailed')),
  });
  const delegateMutate = delegate.mutate;
  const printReceipt = useCallback((o: OrderResponse, output: ReceiptOutput = 'printer', opts: PrintOptions = {}) => {
    if (output === 'printer' && !opts.local && !canPrintHere()) {
      delegateMutate(o);
      opts.onResult?.(false);
      return;
    }
    setPrintQueue((prev) => [...prev, {
      order: o,
      restaurant: restaurantQ.data,
      tableNumber: o.tableId != null ? printTableNo.get(o.tableId) ?? null : null,
      output,
      auto: opts.auto,
      local: opts.local,
      onResult: opts.onResult,
    }]);
  // No `t`/`toast` here: the callback never reads them, and `useT` hands back a fresh closure
  // every render — listing it recreated printReceipt each render, which re-ran the station
  // effect each render, which (with a stale job list) was one half of the duplicate storm.
  }, [restaurantQ.data, printTableNo, delegateMutate]);

  // Shell-level so order alerts fire on every tab, not just the live board.
  const alerts = useLiveOrderAlerts(branchId, sound.ping, t);

  /* The print station pulls a real queue off the server (print_jobs), prints each job, and
     acknowledges it. This replaced a diff of two live-board snapshots, which inferred the
     work from what had appeared since the last look — so a tab that reloaded, slept or was
     killed took its memory of "already seen" with it and silently dropped every ticket that
     arrived in the gap. A job now sits PENDING until something says it printed, so the same
     outage means late paper instead of no paper.

     Counter mode is what enqueues arriving tickets (server side, in the order's own
     transaction); the branch switch and the per-device station flag are what decide whether
     THIS tablet is the one that collects them. A device that cannot print itself is never a
     station — it would only hand its own jobs back to the queue it just pulled them from. */
  const station = selectedBranchQ.data;
  const stationPresenceQ = useQuery({
    queryKey: ['print-station', branchId],
    queryFn: () => api.get<StationStatus>(`/api/dashboard/print-jobs/station?branchId=${branchId}`),
    enabled: !!branchId && !!station?.printerEnabled,
    refetchInterval: 15_000,
  });
  const appCollecting = !!stationPresenceQ.data?.appCollecting;
  // When the Serva Station app is polling, this browser must not. Otherwise an old
  // "this tablet prints incoming tickets" switch races the app for jobs.
  const isStation = !!branchId && !!station?.printerEnabled && isPrintStation(branchId) && canPrintHere() && !appCollecting;
  useEffect(() => {
    if (branchId && appCollecting && isPrintStation(branchId)) setPrintStation(branchId, false);
  }, [branchId, appCollecting]);
  const stationId = useMemo(getStationId, []);
  const jobsQ = useQuery({
    queryKey: ['print-jobs', branchId, stationId],
    // A pull, not a read: the server records this device as collecting and claims each job
    // for it, so a second tablet also flagged as the station is handed nothing this one holds.
    queryFn: () => api.post<PrintJobResponse[]>(`/api/dashboard/print-jobs/pull?branchId=${branchId}&stationId=${encodeURIComponent(stationId)}`, {}),
    enabled: isStation,
    refetchInterval: 5_000,
    // A counter tablet is an appliance, not a browsing session: keep collecting even when the
    // tab loses focus, rather than waiting for someone to touch it.
    refetchIntervalInBackground: true,
  });
  // Jobs already handed to the printing app, and acks that failed to land. Without `claimed`
  // the 5s poll would offer a slow print again and duplicate it. Without `unacked`, an ack
  // lost to a Wi-Fi blip would leave the job PENDING on the server with nothing retrying,
  // and the next reload would print it a second time — so a lost ack is retried on every
  // poll until it lands, and the job is never reprinted meanwhile.
  const claimed = useRef<Set<number>>(new Set());
  const unacked = useRef<Set<number>>(new Set());
  // A reload between "the printer took it" and "the server heard the ack" used to forget
  // both and print the ticket again. The done-list on disk remembers; on load those jobs are
  // already-printed-awaiting-ack, so they get the ack retried and never a second sheet.
  useEffect(() => {
    for (const id of printedButUnacked()) { claimed.current.add(id); unacked.current.add(id); }
  }, []);
  const ack = useCallback((jobId: number) => {
    api.post(`/api/dashboard/print-jobs/${jobId}/ack`, {})
      // `claimed` is NOT released here. A poll that left before this ack landed can still
      // come back listing the job, and releasing early let that stale answer print it again
      // (measured: one ticket, several sheets). The claim is released only once a poll no
      // longer offers the job, which cannot happen until the server has seen the ack.
      .then(() => { unacked.current.delete(jobId); forgetPrinted(jobId); })
      .catch(() => { unacked.current.add(jobId); });
  }, []);
  // Keyed on the fetch time, not the list: an unchanged list comes back as the same reference
  // and would not re-run this, and a lost ack is only ever retried from here — so it must run
  // on every poll, even the ones that bring nothing new.
  const polledAt = jobsQ.dataUpdatedAt;
  useEffect(() => {
    if (!isStation || !jobsQ.data) return;
    const offered = new Set(jobsQ.data.map((job) => job.id));
    // Anything the server has stopped offering is finished with: acked, or expired. Forget
    // it on both sides so the sets only ever hold jobs that are actually in flight.
    claimed.current.forEach((id) => { if (!offered.has(id)) claimed.current.delete(id); });
    unacked.current.forEach((id) => { if (!offered.has(id)) unacked.current.delete(id); });
    for (const job of jobsQ.data) {
      if (unacked.current.has(job.id)) { ack(job.id); continue; }
      if (claimed.current.has(job.id)) continue;
      claimed.current.add(job.id);
      printReceipt(job.order, 'printer', {
        auto: true,
        local: true,
        onResult: (ok) => {
          // Remembered on disk before the ack leaves, so a reload in between cannot reprint.
          if (ok) { rememberPrinted(job.id); ack(job.id); }
          // Refused: forget it, so the next poll offers it again once the printer is back.
          else claimed.current.delete(job.id);
        },
      });
    }
  }, [polledAt, isStation, printReceipt, ack]); // eslint-disable-line react-hooks/exhaustive-deps
  /* The board holds a screen wake lock, but the station listener runs on every page — so a
     tablet parked on the order pad used to let its screen sleep and quietly stop collecting.
     Hold the lock for as long as this device is the station, wherever it is. */
  useWakeLock(isStation);

  /* The one failure the queue cannot fix is nobody collecting it — the station tablet died,
     slept, or was never set up — and until now that failed in silence. Every OTHER device
     in the café now watches for it: tickets waiting with no station polling puts a warning
     in the top bar on every phone and iPad on the floor. Quiet again by itself once a
     station picks the jobs up, or once they age out. */
  /* Keyed on how long tickets have waited, not on whether a station is collecting — because
     a station whose printer has died is still collecting. It polls, claims and renders, and
     fails only at the socket, so "collecting" stays true while the café silently stops getting
     paper. A healthy station drains a ticket in seconds, so anything still waiting after 90
     is wrong whichever way it broke, and the wording says which. */
  const watch = stationPresenceQ.data;
  const printerAlarm = !isStation && watch && watch.oldestPendingSeconds > 90 ? watch.pending : 0;
  const alarmKey = watch?.collecting ? 'printerStuck' : 'printerAlarm';
  const calmStream = useCalmStream(alerts.stream);

  return (
    <ReceiptPrinterProvider value={printReceipt}>
    <div className="dash">
      <aside className="rail">
        <div className="logo">S.</div>
        <nav className="nav">
          {navItems.map((it) => (
            <button key={it.key} className={page === it.key ? 'on' : ''} onClick={() => setPage(it.key)}
              aria-label={it.beta ? `${it.label} · ${t('beta')}` : it.label}>
              {it.icon}
              {/* Said on the icon, because the rail is where the tab is chosen and a label
                  that only appears once you are inside is a label that arrives too late. */}
              {it.beta && <span className="beta-tag" aria-hidden>{t('beta')}</span>}
              <span className="tip">{it.label}{it.beta ? ` · ${t('beta')}` : ''}</span>
            </button>
          ))}
        </nav>
        <button className="out" title={t('logoutT')} aria-label={t('logoutT')} onClick={() => logout()}><IcPower /></button>
      </aside>

      <div className="dmain">
        <div className="dtop">
          <h2>{titles[page]}</h2>
          {page === 'board' && <LivePill stream={calmStream} t={t} />}
          {/* Not a .dlive: the top bar collapses those to a bare dot on phones, and a warning
              nobody can read is the silence this exists to end. Phones keep the icon and the
              count; wider screens get the sentence too. */}
          {printerAlarm > 0 && (
            <span className="dprinter" role="status" title={t(`${alarmKey}Hint`)}>
              <span className="d" />🖨 <span className="lbl">{t(alarmKey)}</span><b>{printerAlarm}</b>
            </span>
          )}
          <div className="spacer" />
          {page === 'board' && can(user, 'ORDERS') && (
            <button className="dnew" onClick={() => setPage('neworder')}>＋ {t('nav_neworder')}</button>
          )}
          {/* Whether the café is accepting orders is operational state the whole floor needs
              to see at a glance — it used to be buried two clicks deep in the avatar menu. */}
          {can(user, 'ORDERS') && selectedBranch && (
            <OrderingStatusControl
              t={t}
              accepting={selectedBranch.acceptingOrders}
              pending={orderingStatus.isPending}
              onToggle={toggleOrdering}
            />
          )}
          <SoundToggle soundOn={sound.soundOn} onToggle={sound.toggle} />
          <AccountMenu
            t={t}
            branches={isManager(user) && pinnedBranch == null ? activeBranches : []}
            branchId={branchId}
            onBranch={setBranchId}
          />
        </div>

        {alerts.unacked > 0 && (
          <button className="newbanner" onClick={() => { alerts.clear(); setFocusBoard((n) => n + 1); setPage('board'); }}>
            <span className="nb-dot" />
            <b>{alerts.unacked}</b> {t('newOrders')} · {t('tapView')}
          </button>
        )}
        {page === 'board' && <KdsBoard branchId={branchId} focusSignal={focusBoard} />}
        {page === 'neworder' && <OrderPad branchId={branchId} onPlaced={() => setPage('board')} />}
        {page === 'orders' && <OrdersPage branchId={branchId} />}
        {page === 'menu' && <MenuManager branchId={branchId} />}
        {page === 'team' && <TeamPage branches={branches} branchId={branchId} />}
        {page === 'analytics' && <Suspense fallback={<div className="an-msg">…</div>}><AnalyticsPage branches={isManager(user) && pinnedBranch == null ? activeBranches : []} /></Suspense>}
        {page === 'stock' && <StockPage branchId={branchId} />}
        {page === 'tables' && <TablesPage branchId={branchId} />}
        {/* pushes (not replaces) so the back button returns to the loyalty dashboard */}
        {page === 'loyalty' && <LoyaltyPage onOpenSetup={() => navigate('/dashboard/settings/loyalty')} />}
        {page === 'settings' && <SettingsPage section={urlSection} onSection={setSection} branchId={branchId} />}
      </div>

      <nav className="dnav-bottom">
        {primaryNav.map((it) => (
          <button key={it.key} className={page === it.key ? 'on' : ''} onClick={() => setPage(it.key)}>
            <span className="ic">{it.icon}{it.beta && <span className="beta-tag" aria-hidden>{t('beta')}</span>}</span>
            <span className="lb">{it.label}</span>
          </button>
        ))}
        {overflowNav.length > 0 && (
          <button className={'dnav-more' + (moreActive ? ' on' : '')} onClick={() => setMoreOpen(true)}
            aria-haspopup="menu" aria-expanded={moreOpen}>
            <span className="ic"><IcMore /></span><span className="lb">{t('more')}</span>
          </button>
        )}
      </nav>

      {moreOpen && (
        <div className="more-sheet-bg" onClick={(e) => { if (e.target === e.currentTarget) setMoreOpen(false); }}>
          <div className="more-sheet" role="menu">
            <div className="more-sheet-grip" />
            <div className="more-grid">
              {overflowNav.map((it) => (
                <button key={it.key} role="menuitem" className={'more-item' + (page === it.key ? ' on' : '')}
                  onClick={() => { setPage(it.key); setMoreOpen(false); }}>
                  <span className="more-ic">{it.icon}</span>
                  <span className="more-lb">{it.label}{it.beta && <em className="beta-inline">{t('beta')}</em>}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <ReceiptCapture
        pending={printQueue[0] ?? null}
        onDone={() => setPrintQueue((prev) => prev.slice(1))}
      />
    </div>
    </ReceiptPrinterProvider>
  );
}

/* ============================ ORDERING STATUS ============================
   Promoted out of the account dropdown into the header: staff need to see at a
   glance whether the café is taking orders, and an owner shouldn't have to dig
   through an identity menu to reopen the floor. */
function OrderingStatusControl({ t, accepting, pending, onToggle }: {
  t: (k: string) => string;
  accepting: boolean;
  pending: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={'order-status-toggle' + (accepting ? '' : ' paused')}
      disabled={pending}
      aria-label={t(accepting ? 'pauseOrders' : 'resumeOrders')}
      title={t(accepting ? 'pauseOrders' : 'resumeOrders')}
      onClick={onToggle}
    >
      <span className="status-dot" aria-hidden="true" />
      <span className="ost-label">{t(accepting ? 'ordersOpen' : 'ordersPaused')}</span>
    </button>
  );
}

/* ============================ ACCOUNT MENU ============================
   Identity only. Café/menu/receipt/loyalty settings moved to /dashboard/settings —
   nobody opens a "who am I" menu looking for a VAT rate. */
function AccountMenu({
  t,
  branches,
  branchId,
  onBranch,
}: {
  t: (k: string) => string;
  branches: BranchResponse[];
  branchId?: number;
  onBranch: (id: number) => void;
}) {
  const { user } = useAuth();
  const { lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initials = (personName(user, lang) || user!.username).split(' ').map((s) => s[0]).slice(0, 2).join('');
  const roleLabel = user!.owner ? t('role_owner') : t('role_staff');

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="who" ref={ref}>
      <button className="who-btn" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        <div className="av">{initials}</div>
        <div className="who-txt"><div className="nm">{personName(user, lang)}</div><div className="rl">{roleLabel}</div></div>
        <span className="who-caret" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="acct-menu" role="menu">
          <div className="acct-head">
            <div className="av lg">{initials}</div>
            <div className="acct-id">
              <div className="acct-name">{personName(user, lang)}</div>
              <div className="acct-mail" title={user!.email ?? user!.username}>{user!.email ?? user!.username}</div>
              <span className="acct-role">{roleLabel}</span>
            </div>
          </div>
          <div className="acct-sep" />
          <button className="acct-item" role="menuitem" onClick={() => { setOpen(false); setPwOpen(true); }}>
            <span className="ai-ic">🔒</span>{t('changePassword')}
          </button>
          <button className="acct-item" role="menuitem" onClick={() => { setOpen(false); setEmailOpen(true); }}>
            <span className="ai-ic">@</span>{t('changeEmail')}
          </button>
          <div className="acct-sep" />
          {branches.length > 1 && (
            <div className="acct-row" role="group" aria-label={t('branch')}>
              <span>{t('branch')}</span>
              <select className="select" value={branchId ?? ''} onChange={(e) => onBranch(Number(e.target.value))}>
                {branches.map((b) => <option key={b.id} value={b.id}>{nameOf(b, lang)}</option>)}
              </select>
            </div>
          )}
          <div className="acct-lang" role="group" aria-label={t('language')}>
            <span>{t('language')}</span>
            <div className="acct-lang-btns">
              <button className={lang === 'ar' ? 'on' : ''} onClick={() => setLang('ar')}>{t('arabic')}</button>
              <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>{t('english')}</button>
            </div>
          </div>
          <button className="acct-item danger" role="menuitem" onClick={() => logout()}>
            <span className="ai-ic">⏻</span>{t('logoutT')}
          </button>
        </div>
      )}
      {pwOpen && <ChangePasswordModal t={t} onClose={() => setPwOpen(false)} />}
      {emailOpen && <ChangeEmailModal t={t} onClose={() => setEmailOpen(false)} />}
    </div>
  );
}

function ChangePasswordModal({ t, onClose }: { t: (k: string) => string; onClose: () => void }) {
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  const change = useMutation({
    mutationFn: () => api.post('/api/auth/change-password', { currentPassword: cur, newPassword: next }),
    onSuccess: () => { toast(t('pwChanged')); onClose(); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  const tooShort = next.length > 0 && next.length < 8;
  const mismatch = confirm.length > 0 && next !== confirm;
  const canSave = !!cur && next.length >= 8 && next === confirm && !change.isPending;

  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <h3>{t('changePassword')}</h3>
        <div className="ph">{t('changePwSub')}</div>
        <div className="pwform">
          <input className="input" type="password" autoComplete="current-password" placeholder={t('currentPw')}
            value={cur} onChange={(e) => setCur(e.target.value)} />
          <input className="input" type="password" autoComplete="new-password" placeholder={t('newPw')}
            value={next} onChange={(e) => setNext(e.target.value)} />
          {tooShort && <div className="pwhint bad">{t('pwTooShort')}</div>}
          <input className="input" type="password" autoComplete="new-password" placeholder={t('confirmPw')}
            value={confirm} onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canSave) change.mutate(); }} />
          {mismatch && <div className="pwhint bad">{t('pwMismatch')}</div>}
        </div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>{t('cancel')}</button>
          <button className="btn" disabled={!canSave} onClick={() => change.mutate()}>{change.isPending ? '…' : t('save')}</button>
        </div>
      </div>
    </div>
  );
}

function ChangeEmailModal({ t, onClose }: { t: (k: string) => string; onClose: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState(user!.email ?? '');
  const email = next.trim();
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const change = useMutation({
    mutationFn: () => changeEmail(cur, email),
    onSuccess: () => { toast(t('emailChanged')); onClose(); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  const invalid = email.length > 0 && !validEmail;
  const unchanged = email.toLowerCase() === (user!.email ?? '').toLowerCase();
  const canSave = !!cur && validEmail && !unchanged && !change.isPending;

  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <h3>{t('changeEmail')}</h3>
        <div className="ph">{t('changeEmailSub')}</div>
        <div className="pwform">
          <input className="input" type="password" autoComplete="current-password" placeholder={t('currentPw')}
            value={cur} onChange={(e) => setCur(e.target.value)} />
          <input className="input" type="email" autoComplete="username" placeholder={t('newEmail')}
            value={next} onChange={(e) => setNext(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canSave) change.mutate(); }} />
          {invalid && <div className="pwhint bad">{t('emailInvalid')}</div>}
        </div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>{t('cancel')}</button>
          <button className="btn" disabled={!canSave} onClick={() => change.mutate()}>{change.isPending ? '…' : t('save')}</button>
        </div>
      </div>
    </div>
  );
}

/* ============================ KDS BOARD ============================ */
type Modal = { type: 'accept' | 'decline' | 'cancel'; order: OrderResponse } | null;

/* Live "who's on the menu right now" per QR — initial fetch + 30s safety poll,
   with SSE pushing instant snapshots into the same query cache. Shared by the
   KDS board strip and the Tables tab. Rebuilds the stream when the JWT rotates —
   EventSource can't update its URL itself. */
function useQrActivity(branchId?: number) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['qr-activity', branchId],
    queryFn: () => api.get<QrActivity>(`/api/dashboard/qr-activity?branchId=${branchId}`),
    enabled: !!branchId,
    refetchInterval: 30_000,
  });
  // Same ticket-not-token rule as the order stream — see useLiveOrderAlerts.
  const [ticket, setTicket] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => { streamTicket().then((tk) => { if (live) setTicket(tk); }); };
    load();
    const off = onAuthChange(load);
    return () => { live = false; off(); };
  }, []);
  useEffect(() => {
    if (!branchId || !ticket) return;
    const url = `/api/dashboard/qr-activity/stream?branchId=${branchId}&ticket=${encodeURIComponent(ticket)}`;
    const es = new EventSource(url);
    const onMsg = (e: MessageEvent) => {
      try { qc.setQueryData(['qr-activity', branchId], JSON.parse(e.data) as QrActivity); } catch { /* ignore */ }
    };
    es.addEventListener('qr-activity', onMsg as EventListener);
    /* A ticket that expired while the tab slept makes the reconnect 401, and EventSource
       gives up for good on a bad status — so a failure fetches a fresh one, which changes
       the URL and rebuilds the connection. */
    es.onerror = () => { streamTicket().then((tk) => { if (tk && tk !== ticket) setTicket(tk); }); };
    return () => { es.removeEventListener('qr-activity', onMsg as EventListener); es.close(); };
  }, [branchId, qc, ticket]);
  return data;
}

function cartPreview(cart: QrCartItem[] | undefined, lang: string, limit = 3) {
  if (!cart?.length) return '';
  const shown = cart.slice(0, limit).map((i) =>
    `${ltrText(i.quantity + '×')} ${lang === 'ar' ? (i.nameAr || i.nameEn) : (i.nameEn || i.nameAr)}`);
  return `${shown.join(' · ')}${cart.length > limit ? ' ...' : ''}`;
}

function ActivitySummary({ ordering, t }: { ordering: number; t: (k: string) => string }) {
  return (
    <div className="qa-summary">
      <span className="qa-kicker"><span className="qa-d" />{t('qaLive')}</span>
      <span className="qa-bigmetric"><b>{ordering}</b>{t('qaOrdering')}</span>
    </div>
  );
}

/* Slim "get ready" strip above the KDS columns: only carts being built now.
   Pure browsing is intentionally hidden so the kitchen sees signals, not noise. */
function LiveActivityStrip({ activity, tokenToTable, t, lang }: {
  activity?: QrActivity; tokenToTable: Map<string, string>; t: (k: string) => string; lang: string;
}) {
  if (!activity || activity.totalOrdering <= 0) return null;
  const chips = Object.entries(activity.liveByKey)
    .map(([key, v]) => ({ key, ...v, cart: activity.cartsByKey?.[key] ?? [] }))
    .filter((v) => v.ordering > 0 || v.cart.length > 0)
    .sort((a, b) => (b.cart.length - a.cart.length) || (b.ordering - a.ordering));
  const placeOf = (key: string) => {
    if (key === 'car') return { code: 'CAR', label: t('car') };
    const table = tokenToTable.get(key) ?? '';
    return { code: table ? `T${table}` : 'TBL', label: `${t('table')} ${table}`.trim() };
  };
  return (
    <section className="qa-strip" aria-label={t('orderingNow')}>
      <ActivitySummary ordering={activity.totalOrdering} t={t} />
      <div className="qa-feed">
        {chips.map((c) => {
          const place = placeOf(c.key);
          const cart = cartPreview(c.cart, lang);
          return (
            <article className="qa-card active" key={c.key} title={t('qaCartHint')}>
              <div className="qa-card-top">
                <span className="qa-type">{place.code}</span>
                <b className="qa-place">{place.label}</b>
              </div>
              <div className="qa-cartline"><b>{cart || `${c.ordering} ${t('qaOrdering')}`}</b></div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* ---- Splitting one bill between the people at the table ----------------------------------
   Cafés asked for this so five friends can each pay their own share, but what earns it a place
   in the ledger is the drawer: one order used to mean one method, so a bill where three paid
   cash and two paid card put the whole amount in a single bucket and the closing cash count
   came out wrong by the difference. Every share is recorded with the method that person
   actually handed over.

   The tally stays on this device until the bill is covered, then one request writes every
   share (POST /split). Nothing is written from a half-finished split, so a tablet that reloads
   mid-way leaves the order exactly as it was — unpaid — rather than half-settled. */

type Tender = 'CASH' | 'CARD';
/** One person's share. Amounts are whole baisa (1/1000 OMR): three ways of 10.000 has to add
 *  back up to 10.000 to the last baisa, and float thirds do not. */
type Share = { baisa: number; paid: Tender | null; typed: boolean };

const MAX_PEOPLE = 12;
const blankShares = (n: number): Share[] => Array.from({ length: n }, () => ({ baisa: 0, paid: null, typed: false }));

/** Spread what is still unclaimed over the shares nobody has paid or typed over, giving the
 *  leftover baisa to the first few. Every share stays whole and they always sum to the bill. */
function spread(totalBaisa: number, shares: Share[]): Share[] {
  const free = shares.flatMap((s, i) => (s.paid || s.typed ? [] : [i]));
  if (!free.length) return shares;
  const claimed = shares.reduce((sum, s) => sum + (s.paid || s.typed ? s.baisa : 0), 0);
  const rest = Math.max(0, totalBaisa - claimed);
  const each = Math.floor(rest / free.length);
  const over = rest - each * free.length;
  return shares.map((s, i) => {
    const k = free.indexOf(i);
    return k < 0 ? s : { ...s, baisa: each + (k < over ? 1 : 0) };
  });
}

/** Drop shares from the end to reach n, skipping any that are already paid. */
function trimShares(shares: Share[], n: number): Share[] {
  const out = [...shares];
  for (let i = out.length - 1; i >= 0 && out.length > n; i--) if (!out[i].paid) out.splice(i, 1);
  return out;
}

function SplitBill({ total, busy, t, onSettle, onBack }: {
  total: number; busy: boolean; t: (key: string) => string;
  onSettle: (tenders: PaymentTender[]) => void; onBack: () => void;
}) {
  const totalBaisa = Math.round(total * 1000);
  const [shares, setShares] = useState<Share[]>(() => spread(totalBaisa, blankShares(2)));
  // The row being typed in keeps its raw text, so a half-typed "3.1" is not reformatted away
  // under the staff member's fingers.
  const [typing, setTyping] = useState<{ at: number; text: string } | null>(null);

  const paidCount = shares.filter((s) => s.paid).length;
  // What would actually be sent. A share of zero is not a payment — it happens when one person
  // is typed in for the whole bill and the other rows fall to nothing — so it never travels.
  const tenders: PaymentTender[] = shares
    .filter((s) => s.paid && s.baisa > 0)
    .map((s) => ({ method: s.paid!, amount: s.baisa / 1000 }));
  const covered = shares.reduce((sum, s) => sum + (s.paid ? s.baisa : 0), 0);
  const left = totalBaisa - covered;
  const evenShares = shares.filter((s) => !s.paid && !s.typed);
  const even = evenShares.length ? Math.max(...evenShares.map((s) => s.baisa)) : 0;
  const rounded = evenShares.some((s) => s.baisa !== even);
  // Chips go to six, then grow one at a time — a table of nine is rare enough to be worth a tap.
  const chipMax = Math.min(MAX_PEOPLE, Math.max(6, shares.length));

  const setPeople = (n: number) => {
    // A share someone has already paid cannot be taken away, so the floor is the paid count.
    const next = Math.min(MAX_PEOPLE, Math.max(Math.max(paidCount, 2), n));
    setShares((prev) => spread(totalBaisa, next >= prev.length
      ? [...prev, ...blankShares(next - prev.length)]
      : trimShares(prev, next)));
    setTyping(null);
  };

  const tender = (at: number, method: Tender) => {
    setShares((prev) => spread(totalBaisa, prev.map((s, i) =>
      i === at ? { ...s, paid: s.paid === method ? null : method } : s)));
    setTyping(null);
  };

  // Typing an amount pins that share; clearing the box hands it back to the even split.
  const commit = () => {
    if (!typing) return;
    const { at, text } = typing;
    const value = Number(text.replace(',', '.'));
    const pinned = !!text.trim() && Number.isFinite(value) && value > 0;
    setShares((prev) => spread(totalBaisa, prev.map((s, i) => (i !== at ? s
      : pinned ? { ...s, typed: true, baisa: Math.round(value * 1000) } : { ...s, typed: false }))));
    setTyping(null);
  };

  return (
    <div className="split">
      <div className="split-head">
        <span className="split-label">{t('splitPeople')}</span>
        <div className="split-chips">
          {Array.from({ length: chipMax - 1 }, (_, i) => i + 2).map((n) => (
            <button key={n} className={'split-chip num' + (n === shares.length ? ' on' : '')}
              disabled={busy || n < paidCount} aria-pressed={n === shares.length}
              onClick={() => setPeople(n)}><Ltr>{n}</Ltr></button>
          ))}
          {chipMax < MAX_PEOPLE && (
            <button className="split-chip more" disabled={busy} title={t('splitMore')} aria-label={t('splitMore')}
              onClick={() => setPeople(chipMax + 1)}>＋</button>
          )}
        </div>
      </div>

      {even > 0 && (
        <div className="split-each">{t('splitEach')} {rounded ? '≈' : ''}<Money value={even / 1000} className="num" /></div>
      )}

      <div className="split-rows">
        {shares.map((s, i) => (
          <div className={'split-row' + (s.paid ? ' done' : '')} key={i}>
            <span className="split-no num"><Ltr>{i + 1}</Ltr></span>
            <input className="split-amt num" inputMode="decimal" dir="ltr" disabled={busy || !!s.paid}
              aria-label={`${t('splitPerson')} ${i + 1}`}
              value={typing?.at === i ? typing.text : omr(s.baisa / 1000)}
              onFocus={(e) => { setTyping({ at: i, text: omr(s.baisa / 1000) }); e.currentTarget.select(); }}
              onChange={(e) => setTyping({ at: i, text: e.target.value })}
              onBlur={commit}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
            <button className={'split-pay cash' + (s.paid === 'CASH' ? ' on' : '')} disabled={busy}
              aria-pressed={s.paid === 'CASH'} aria-label={`${t('splitPerson')} ${i + 1} · ${t('paymentCash')}`}
              onClick={() => tender(i, 'CASH')}><span aria-hidden="true">💵</span></button>
            <button className={'split-pay card' + (s.paid === 'CARD' ? ' on' : '')} disabled={busy}
              aria-pressed={s.paid === 'CARD'} aria-label={`${t('splitPerson')} ${i + 1} · ${t('paymentCard')}`}
              onClick={() => tender(i, 'CARD')}><span aria-hidden="true">▣</span></button>
          </div>
        ))}
      </div>

      <div className={'split-left' + (left === 0 ? ' ok' : left < 0 ? ' over' : '')} aria-live="polite">
        <span>{left < 0 ? t('splitExtra') : t('splitRemaining')}</span>
        <Money value={Math.abs(left) / 1000} className="num" />
      </div>

      <button className="btn split-settle" disabled={busy || left !== 0 || !tenders.length}
        onClick={() => onSettle(tenders)}>
        {t('splitSettle')}
      </button>
      <button className="btn ghost payment-cancel" disabled={busy} onClick={onBack}>{t('back')}</button>
    </div>
  );
}

function KdsBoard({ branchId, focusSignal }: { branchId?: number; focusSignal: number }) {
  const { user } = useAuth();
  const { lang } = useI18n();
  const t = useT(DICT);
  const toast = useToast();
  const qc = useQueryClient();
  const printReceipt = useReceiptPrinter();

  // keep the screen awake while the live board is open (counter phone / tablet)
  useWakeLock(true);

  const restaurantQ = useQuery({
    queryKey: ['restaurant', user!.restaurantId],
    queryFn: () => api.get<Restaurant>(`/api/restaurants/${user!.restaurantId}`),
    enabled: !!user!.restaurantId,
  });
  // Same cache key the Shell uses — react-query dedupes, so this costs no extra request.
  const branchQ = useQuery({
    queryKey: ['branch', branchId],
    queryFn: () => api.get<BranchResponse>(`/api/branches/${branchId}`),
    enabled: !!branchId,
  });
  const { data: tablesRaw } = useQuery({
    queryKey: ['tables', branchId],
    queryFn: () => api.get<any>(`/api/branches/${branchId}/tables`),
    enabled: !!branchId,
  });
  const tableNo = useMemo(() => {
    const list: TableResponse[] = Array.isArray(tablesRaw) ? tablesRaw : tablesRaw?.content ?? [];
    return new Map(list.map((tb) => [tb.id, tb.tableNumber]));
  }, [tablesRaw]);
  // live activity is keyed by qrCodeToken, not table id
  const tokenToTable = useMemo(() => {
    const list: TableResponse[] = Array.isArray(tablesRaw) ? tablesRaw : tablesRaw?.content ?? [];
    return new Map(list.map((tb) => [tb.qrCodeToken, tb.tableNumber]));
  }, [tablesRaw]);
  const activity = useQrActivity(branchId);

  const liveKey = ['live', branchId ?? 'all'];
  const { data: orders = [] } = useQuery({
    queryKey: liveKey,
    queryFn: () => api.get<OrderResponse[]>(`/api/dashboard/orders/live${branchId ? `?branchId=${branchId}` : ''}`),
    refetchInterval: 15_000,
  });

  const [mobileCol, setMobileCol] = useState<OrderStatus>('PENDING');
  // Counter mode: nothing lands in New (orders auto-accept), so on a phone the board should
  // open on the open tabs in In progress rather than an empty New column.
  const counterMode = !!branchQ.data?.counterMode;
  useEffect(() => { if (counterMode) setMobileCol('ACCEPTED'); }, [counterMode]);
  // The stream + alerts now live in the Shell (useLiveOrderAlerts) so they fire on every
  // tab; the board just renders the cache that stream keeps warm. Tapping the shell's
  // new-order banner bumps focusSignal — jump the mobile board back to the New column.
  useEffect(() => { if (focusSignal) setMobileCol(branchQ.data?.counterMode ? 'ACCEPTED' : 'PENDING'); }, [focusSignal]); // eslint-disable-line

  const [, setTick] = useState(0);
  useEffect(() => { const i = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(i); }, []);

  const [modal, setModal] = useState<Modal>(null);
  const [field, setField] = useState('');
  // What happens once the payment is recorded: 'complete' (Collect · Done on a Ready card),
  // 'ready' (Collect on an in-progress counter-mode order — paying is what moves it on), or nothing.
  type AfterPay = 'complete' | 'ready' | null;
  const [paymentPrompt, setPaymentPrompt] = useState<{ order: OrderResponse; after: AfterPay } | null>(null);
  // Second step of the same modal: the bill is being divided between the people at the table.
  const [splitting, setSplitting] = useState(false);

  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api.patch<OrderResponse>(path, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: liveKey }),
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });
  const pay = useMutation({
    mutationFn: ({ orderId, method }: { orderId: number; method: 'CASH' | 'CARD' }) =>
      api.post(`/api/payments/orders/${orderId}/mark-paid`, { method }),
    onSuccess: () => qc.invalidateQueries({ queryKey: liveKey }),
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });
  // A split settles in one request: every share, with the method that person actually paid with.
  const split = useMutation({
    mutationFn: ({ orderId, tenders }: { orderId: number; tenders: PaymentTender[] }) =>
      api.post(`/api/payments/orders/${orderId}/split`, { tenders }),
    onSuccess: () => qc.invalidateQueries({ queryKey: liveKey }),
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  // Auto-print on THIS device when it completes an order (branch toggle permitting). A device
  // with no printing app hands it to the branch's print station instead — printReceipt does
  // that itself. Counter-mode branches printed the ticket when the order arrived, so
  // completing must not print it again.
  const printIfEnabled = (o: OrderResponse) => {
    if (branchQ.data?.printerEnabled && !branchQ.data?.counterMode) printReceipt(o, 'printer', { auto: true });
  };
  const afterPaid = (order: OrderResponse, after: AfterPay) => {
    if (after === 'complete') act.mutate({ path: `/api/dashboard/orders/${order.id}/complete` }, { onSuccess: printIfEnabled });
    if (after === 'ready') act.mutate({ path: `/api/dashboard/orders/${order.id}/ready` });
  };
  const finishOrder = (o: OrderResponse, collect: boolean) => {
    if (collect) requestPayment(o, 'complete');
    else afterPaid(o, 'complete');
  };
  // In counter mode an in-progress order is an open tab: marking it paid is what moves it to Ready.
  const inProgress = (o: OrderResponse) => o.status === 'ACCEPTED' || o.status === 'PREPARING';
  const payOrder = (o: OrderResponse) => requestPayment(o, counterMode && inProgress(o) ? 'ready' : null);
  const requestPayment = (order: OrderResponse, after: AfterPay) => {
    if (restaurantQ.data?.paymentMethodSelectionEnabled) {
      setSplitting(false);
      setPaymentPrompt({ order, after });
      return;
    }
    pay.mutate({ orderId: order.id, method: 'CARD' }, { onSuccess: () => afterPaid(order, after) });
  };
  const closePayment = () => { setPaymentPrompt(null); setSplitting(false); };
  const recordPayment = (method: 'CASH' | 'CARD') => {
    if (!paymentPrompt) return;
    const { order, after } = paymentPrompt;
    pay.mutate({ orderId: order.id, method }, {
      onSuccess: () => {
        closePayment();
        afterPaid(order, after);
      },
    });
  };
  const recordSplit = (tenders: PaymentTender[]) => {
    if (!paymentPrompt) return;
    const { order, after } = paymentPrompt;
    split.mutate({ orderId: order.id, tenders }, {
      onSuccess: () => {
        closePayment();
        afterPaid(order, after);
      },
    });
  };

  const openModal = (type: NonNullable<Modal>['type'], order: OrderResponse) => { setField(type === 'accept' ? '6' : ''); setModal({ type, order }); };
  const confirmModal = () => {
    if (!modal) return;
    const id = modal.order.id;
    if (modal.type === 'accept') act.mutate({ path: `/api/dashboard/orders/${id}/accept`, body: { prepTimeMinutes: Number(field) || null } });
    if (modal.type === 'decline') act.mutate({ path: `/api/dashboard/orders/${id}/decline`, body: { reason: field || null } });
    if (modal.type === 'cancel') act.mutate({ path: `/api/dashboard/orders/${id}/cancel`, body: { reason: field || null } });
    setModal(null);
  };

  const canAccept = canAcceptOrders(user);
  const canPay = can(user, 'PAYMENTS');

  return (
    <>
      <LiveActivityStrip activity={activity} tokenToTable={tokenToTable} t={t} lang={lang} />

      <div className="board-tabs">
        {COLS.map((c) => {
          const n = orders.filter((o) => o.status === c.st).length;
          return (
            <button key={c.st} className={mobileCol === c.st ? 'on' : ''} style={{ ['--col' as any]: c.color }} onClick={() => setMobileCol(c.st)}>
              <span className="bt-dot" style={{ background: c.color }} />{t('col_' + c.st)}<span className="bt-cnt">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="board">
        {COLS.map((c) => {
          const list = orders.filter((o) => o.status === c.st);
          return (
            <div className={'col' + (mobileCol === c.st ? ' active' : '')} key={c.st} style={{ ['--col' as any]: c.color }}>
              <div className="col-head"><span className="dot" style={{ background: c.color }} /><h3>{t('col_' + c.st)}</h3><span className="cnt" style={{ background: c.color }}>{list.length}</span></div>
              <div className="col-body">
                {list.length === 0 ? <div className="col-empty">{t('empty')}</div> : list.map((o) => (
                  <OrderCard key={o.id} o={o} tableNo={tableNo} t={t} lang={lang} canAccept={canAccept} canPay={canPay} counterMode={counterMode}
                    onAccept={() => openModal('accept', o)} onDecline={() => openModal('decline', o)} onCancel={() => openModal('cancel', o)}
                    onReady={() => act.mutate({ path: `/api/dashboard/orders/${o.id}/ready` })}
                    onComplete={() => finishOrder(o, false)} onCollect={() => finishOrder(o, true)}
                    onPay={() => payOrder(o)} onPrint={() => printReceipt(o)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {modal && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="modal-card">
            <h3>{t(modal.type + 'T')}</h3>
            <div className="ph">{t(modal.type + 'P')} · <Ltr>#{modal.order.dailyNumber}</Ltr></div>
            {modal.type === 'accept'
              ? <><input className="input num" type="number" min={1} value={field} onChange={(e) => setField(e.target.value)} />
                  <div className="preset">{[3, 5, 8, 10, 15].map((n) => <button key={n} onClick={() => setField(String(n))}>{n} {t('min')}</button>)}</div></>
              : <textarea className="input" rows={2} value={field} placeholder={t('reason') + '…'} onChange={(e) => setField(e.target.value)} />}
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setModal(null)}>{t('back')}</button>
              <button className={'btn' + (modal.type === 'accept' ? '' : ' danger')} onClick={confirmModal}>{t('confirm')}</button>
            </div>
          </div>
        </div>
      )}

      {paymentPrompt && (
        <div className="modal-bg" onClick={(e) => {
          if (e.target === e.currentTarget && !pay.isPending && !split.isPending) closePayment();
        }}>
          <div className="modal-card payment-method-modal" role="dialog" aria-modal="true" aria-labelledby="payment-method-title">
            <h3 id="payment-method-title">{t(splitting ? 'splitTitle' : 'paymentTitle')}</h3>
            <div className="ph">{t(splitting ? 'splitSub' : 'paymentSub')} · <Ltr>#{paymentPrompt.order.dailyNumber}</Ltr></div>
            <Money value={paymentPrompt.order.total} className="payment-method-total num" />
            {splitting ? (
              <SplitBill total={paymentPrompt.order.total} busy={split.isPending} t={t}
                onSettle={recordSplit} onBack={() => setSplitting(false)} />
            ) : (
              <>
                <div className="payment-method-grid">
                  <button className="payment-method cash" disabled={pay.isPending} onClick={() => recordPayment('CASH')}>
                    <span aria-hidden="true">💵</span><b>{t('paymentCash')}</b>
                  </button>
                  <button className="payment-method card" disabled={pay.isPending} onClick={() => recordPayment('CARD')}>
                    <span aria-hidden="true">▣</span><b>{t('paymentCard')}</b>
                  </button>
                  <button className="payment-method split" disabled={pay.isPending} onClick={() => setSplitting(true)}>
                    <span aria-hidden="true">👥</span><b>{t('paymentSplit')}</b>
                  </button>
                </div>
                <button className="btn ghost payment-cancel" disabled={pay.isPending} onClick={closePayment}>{t('back')}</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function CarColorTag({ color, lang }: { color?: string | null; lang: string }) {
  const cc = carColorOf(color);
  if (!cc) return null;
  return <span className="carcol"><span className="cc-dot" style={{ background: cc.hex }} />{lang === 'ar' ? cc.ar : cc.en}</span>;
}

function OrderCard({ o, tableNo, t, lang, canAccept, canPay, counterMode, onAccept, onDecline, onCancel, onReady, onComplete, onCollect, onPay, onPrint }: any) {
  const el = fmtElapsed(o.createdAt);
  const mins = (Date.now() - new Date(o.createdAt).getTime()) / 60000;
  // Counter mode: an unpaid in-progress order is an open tab — collecting is the verb that
  // moves it to Ready (the ticket already went to the kitchen), so the Collect button is
  // the one paying control and the "mark paid" pill goes static.
  const collectOpenTab = counterMode && (o.status === 'ACCEPTED' || o.status === 'PREPARING') && o.paymentStatus !== 'PAID' && canPay;
  const where = o.orderType === 'DINE_IN'
    ? <span className="where">🪑 <span className="tg">{t('table')} {o.tableId ? (tableNo.get(o.tableId) ?? o.tableId) : ''}</span></span>
    : <span className="where">🚗 <span className="tg">{t('car')}{o.carPlate ? ` · ${o.carPlate}` : ''}</span><CarColorTag color={o.carColor} lang={lang} /></span>;
  return (
    <div className="ocard">
      <div className="ocard-top"><span className="ordno"><Ltr>#{o.dailyNumber}</Ltr></span><span className={'elapsed' + (mins > 10 ? ' late' : mins > 5 ? ' warn' : '')}>{el}</span>
        <button className="oprint" title={t('printInv')} aria-label={t('printInv')} onClick={onPrint}>🖨</button></div>
      {where}
      {o.status === 'ACCEPTED' && o.prepTimeMinutes ? <span className="where" style={{ color: 'var(--accepted)' }}>⏱ ~ <span className="num">{o.prepTimeMinutes}</span> {t('min')}</span> : null}
      <div className="olines">
        {o.items.map((i: any) => (
          <div className="ln" key={i.id}><span className="q num"><Ltr>{i.quantity}×</Ltr></span>
            <span>{lang === 'ar' ? (i.nameAr || i.nameEn) : (i.nameEn || i.nameAr)}{i.note ? <span className="nt">↳ {i.note}</span> : null}</span></div>
        ))}
      </div>
      {o.loyaltyRewardLabel && <div className="oreward"><b>🎁 {t('loyaltyReward')}</b> {o.loyaltyRewardLabel}{o.loyaltyRewardDiscount ? <> · <Money value={-o.loyaltyRewardDiscount} className="num" /></> : null}</div>}
      {o.customerNote && <div className="onote"><b>{t('note')}:</b> {o.customerNote}{o.customerName ? ` — ${o.customerName}` : ''}</div>}
      <div className="ocard-foot">
        <Money value={o.total} className="ototal num" />
        {o.paymentStatus === 'PAID' ? <span className="pay paid">✓ {t('paid')}</span>
          : canPay && !collectOpenTab ? <span className="pay unpaid" onClick={onPay}>{t('unpaid')}</span>
          : <span className="pay unpaid static">{t('unpaid')}</span>}
      </div>
      {/* Kitchen-only staff (no ORDERS) advance tickets (Start preparing / Ready) but can't accept,
          cancel or complete — those stay gated to ORDERS so the buttons never 403. */}
      <div className="oactions">
        {o.status === 'PENDING' && canAccept && <><button className="btn sm" onClick={onAccept}>{t('accept')}</button><button className="btn sm ghost" onClick={onDecline}>{t('decline')}</button></>}
        {(o.status === 'ACCEPTED' || o.status === 'PREPARING') && (
          collectOpenTab
            ? <><button className="btn collect-btn" onClick={onPay}>✓ {t('collect')} <Money value={o.total} className="num" /></button>{canAccept && <button className="btn sm danger" onClick={onCancel}>{t('cancel')}</button>}</>
            : <><button className="btn sm" onClick={onReady}>{t('ready')}</button>{canAccept && <button className="btn sm danger" onClick={onCancel}>{t('cancel')}</button>}</>
        )}
        {o.status === 'READY' && canAccept && (
          o.paymentStatus !== 'PAID' && canPay
            ? <>
                <button className="btn collect-btn" onClick={onCollect}>✓ {t('collect')} <Money value={o.total} className="num" /> · {t('done')}</button>
                <button className="btn sm ghost" onClick={onComplete}>{t('doneUnpaid')}</button>
              </>
            : <button className="btn sm" onClick={onComplete}>✓ {t('done')}</button>
        )}
      </div>
    </div>
  );
}

/* ============================ TABLES & QR ============================ */
const customerUrlOf = (tb: TableResponse) => {
  try { return window.location.origin + new URL(tb.qrCodeUrl!).pathname; }
  catch { return `${window.location.origin}/t/${tb.qrCodeToken}`; }
};
const carUrlOf = (slug: string, branchId: number) => `${window.location.origin}/r/${slug}/b/${branchId}/car`;
const slugOf = (tb: TableResponse) => { try { return new URL(tb.qrCodeUrl!).pathname.split('/')[2] ?? ''; } catch { return ''; } };
type PrintQrJob = { title: string; subtitle?: string; value: string };

function TablesPage({ branchId }: { branchId?: number }) {
  const t = useT(DICT);
  const { lang } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [num, setNum] = useState('');
  const [singlePrint, setSinglePrint] = useState<PrintQrJob | null>(null);
  const [qrStyle, setQrStyle] = useState<QrBadgeStyle>(() => loadQrStyle(user?.restaurantId));

  const { data: raw, isLoading } = useQuery({
    queryKey: ['tables', branchId],
    queryFn: () => api.get<any>(`/api/branches/${branchId}/tables`),
    enabled: !!branchId,
  });
  const tables: TableResponse[] = Array.isArray(raw) ? raw : raw?.content ?? [];
  const { data: restaurant } = useQuery({
    queryKey: ['restaurant', user?.restaurantId],
    queryFn: () => api.get<Restaurant>(`/api/restaurants/${user!.restaurantId}`),
    enabled: !!user?.restaurantId,
  });
  // Reload saved badge prefs when the signed-in restaurant changes.
  useEffect(() => { setQrStyle(loadQrStyle(user?.restaurantId)); }, [user?.restaurantId]);
  // Pull Google font for the chosen badge face (Bricolage already loaded app-wide).
  useEffect(() => {
    const specs = QR_FONT_GOOGLE[qrStyle.fontId];
    if (specs) ensureGoogleFonts(specs);
  }, [qrStyle.fontId]);

  // The badge style never leaves the browser — it is read here from localStorage, so there
  // is no server call to refuse and the gate has to be enforced wherever the style is used.
  // The answer is still the server's: whether the tier includes QR_CUSTOMIZATION.
  // This page only *draws* with the style; it is edited in Settings → QR code.
  const features = useFeatures();
  const qrCustom = features.has('QR_CUSTOMIZATION');
  const restaurantSlug = restaurant?.slug;
  const cafeName = nameOf(restaurant, lang).trim();
  // Locked plans always get the free default look. Resolve so a café-logo badge draws the
  // logo that is on the profile today, not the one that was there when the style was saved.
  const effectiveStyle: QrBadgeStyle = qrCustom
    ? resolveQrStyle(qrStyle, restaurant?.logoUrl)
    : { ...DEFAULT_QR_STYLE };
  const carUrl = branchId && restaurantSlug ? carUrlOf(restaurantSlug, branchId) : null;
  const invalidate = () => qc.invalidateQueries({ queryKey: ['tables', branchId] });

  // Live "ordering now" + today's orders per QR (shared hook: fetch + poll + SSE).
  const activity = useQrActivity(branchId);
  const todayOf = (key?: string) => (key ? activity?.todayByKey[key] : undefined);
  const ActivityRow = ({ liveKey, todayKey }: { liveKey: string; todayKey: string }) => {
    const day = todayOf(todayKey);
    // Peek into carts being built on this QR right now — a soft "get ready" signal.
    const live = activity?.liveByKey[liveKey];
    const cartPeek = live && live.ordering > 0 ? activity?.cartsByKey?.[liveKey] : undefined;
    const cartText = cartPreview(cartPeek, lang, 4);
    return (
      <div className="qa-row">
        <div className="qa-row-top">
          {live && live.ordering > 0 && !cartText && <span className="qa-live" title={t('qaNow')}><b>{live.ordering}</b> {t('qaOrdering')}</span>}
          <span className="qa-today">{t('qaToday')}: {day?.orders ?? 0} {t('qaOrders')} · <Money value={day?.revenue ?? 0} className="num" /></span>
        </div>
        {cartText && <div className="qa-cart" title={t('qaCartHint')}><b>{cartText}</b></div>}
      </div>
    );
  };

  const create = useMutation({
    mutationFn: () => api.post(`/api/branches/${branchId}/tables`, { tableNumber: num.trim() }),
    onSuccess: () => { setNum(''); invalidate(); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });
  const regen = useMutation({
    mutationFn: (id: number) => api.post(`/api/tables/${id}/regenerate-qr`),
    onSuccess: invalidate, onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });
  const del = useMutation({
    mutationFn: (id: number) => api.del(`/api/tables/${id}`),
    onSuccess: invalidate, onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });
  useEffect(() => {
    const clearSinglePrint = () => setSinglePrint(null);
    window.addEventListener('afterprint', clearSinglePrint);
    return () => window.removeEventListener('afterprint', clearSinglePrint);
  }, []);
  const printAll = () => {
    setSinglePrint(null);
    window.setTimeout(() => window.print(), 0);
  };
  const printOne = (job: PrintQrJob) => {
    setSinglePrint(job);
    window.setTimeout(() => window.print(), 0);
  };

  if (!branchId) return <div className="placeholder"><div><div className="ic">🏬</div><p>—</p></div></div>;

  return (
    <div className="tables-wrap no-print">
      <div className="tables-tool">
        <form className="addtable" onSubmit={(e) => { e.preventDefault(); if (num.trim()) create.mutate(); }}>
          <input className="input" style={{ maxWidth: 160 }} value={num} onChange={(e) => setNum(e.target.value)} placeholder={t('tableNumber')} />
          <button className="btn sm" disabled={!num.trim() || create.isPending}>{t('add')}</button>
        </form>
        <div style={{ flex: 1 }} />
        {/* The studio itself lives in Settings with every other customization; this is the
            way back to it from the screen where you notice the codes look wrong. */}
        <button className="btn sm ghost" type="button"
          onClick={() => navigate('/dashboard/settings/qr')}>◈ {t('qrStyleLink')}</button>
        <button className="btn sm ghost" disabled={!tables.length && !carUrl} onClick={printAll}>🖨 {t('print')}</button>
      </div>

      {isLoading ? <div className="center"><div className="spinner" /></div>
        : tables.length === 0 && !carUrl ? <div className="empty"><div className="big">🪑</div><h3>{t('noTables')}</h3></div>
        : (
          <div className="tcards">
            {carUrl && (
              <div className="tcard" key="outdoor-car">
                <div className="tcard-hd"><span className="tnum">🚗 {t('carQr')}</span></div>
                <div className="qrtile"><BrandedQrCode value={carUrl} size={150} style={effectiveStyle} label={cafeName} /></div>
                <button className="tlink" title={carUrl} onClick={() => { navigator.clipboard?.writeText(carUrl); toast(t('copied')); }}>{t('copy')} ⧉</button>
                <ActivityRow liveKey="car" todayKey="car" />
                <div className="tcard-actions">
                  <button className="btn sm ghost" onClick={() => printOne({ title: t('carQr'), subtitle: restaurantSlug ?? '', value: carUrl })}>🖨 {t('printOne')}</button>
                </div>
              </div>
            )}
            {tables.map((tb) => {
              const url = customerUrlOf(tb);
              return (
                <div className="tcard" key={tb.id}>
                  <div className="tcard-hd"><span className="tnum num">{tb.tableNumber}</span>{!tb.active && <span className="chip">off</span>}</div>
                  <div className="qrtile"><BrandedQrCode value={url} size={150} style={effectiveStyle} label={cafeName} /></div>
                  <button className="tlink" title={url} onClick={() => { navigator.clipboard?.writeText(url); toast(t('copied')); }}>{t('copy')} ⧉</button>
                  <ActivityRow liveKey={tb.qrCodeToken} todayKey={String(tb.id)} />
                  <div className="tcard-actions">
                    <button className="btn sm ghost" onClick={() => printOne({ title: `${t('table')} ${tb.tableNumber}`, subtitle: slugOf(tb), value: url })}>🖨 {t('printOne')}</button>
                    <button className="btn sm ghost" onClick={async () => { if (await confirm({ danger: true, title: t('regenerate'), message: t('regenWarn'), confirmLabel: t('regenerate'), cancelLabel: t('cancel') })) regen.mutate(tb.id); }}>↻ {t('regenerate')}</button>
                    <button className="btn sm danger" onClick={async () => { if (await confirm({ danger: true, title: t('delWarn'), confirmLabel: t('del'), cancelLabel: t('cancel') })) del.mutate(tb.id); }}>{t('del')}</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      {/* printable table tents (portal → outside .dash so print can show only this) */}
      {createPortal(
        singlePrint ? (
          <div className="print-single-sheet">
            {singlePrint.subtitle && <div className="print-single-brand">{singlePrint.subtitle}</div>}
            <div className="print-single-title">{singlePrint.title}</div>
            <div className="print-single-qr">
              <BrandedQrCode value={singlePrint.value} size={560} marginSize={2} style={effectiveStyle} label={cafeName} />
            </div>
            <div className="print-single-scan">{t('scan')}</div>
          </div>
        ) : (
          <div className="print-sheet">
            {carUrl && (
              <div className="tent" key="outdoor-car">
                <div className="tent-brand">{restaurantSlug}</div>
                <div className="tent-table">🚗 {t('carQr')}</div>
                <BrandedQrCode value={carUrl} size={210} marginSize={2} style={effectiveStyle} label={cafeName} />
                <div className="tent-scan">{t('scan')}</div>
              </div>
            )}
            {tables.map((tb) => {
              const url = customerUrlOf(tb);
              return (
                <div className="tent" key={tb.id}>
                  <div className="tent-brand">{slugOf(tb)}</div>
                  <div className="tent-table">{t('table')} {tb.tableNumber}</div>
                  <BrandedQrCode value={url} size={210} marginSize={2} style={effectiveStyle} label={cafeName} />
                  <div className="tent-scan">{t('scan')}</div>
                </div>
              );
            })}
          </div>
        ),
        document.body,
      )}
    </div>
  );
}
