import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { create as createQrMatrix } from 'qrcode/lib/core/qrcode.js';
import { api, upload, ApiError, logout, accessTokenValue, changeEmail, freshStreamToken, onAuthChange, syncUser } from '../../lib/api';
import { useAuth, isManager, canAcceptOrders, can } from '../../lib/auth';
import { useI18n, useT, type Dict } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import { useConfirm } from '../../lib/confirm';
import { useOrderStream, type StreamStatus } from '../../lib/sse';
import { useOrderSound, SoundToggle, notify, closeNotify } from '../../lib/alerts';
import { useWakeLock } from '../../lib/wakeLock';
import { fmtElapsed } from '../../lib/format';
import { Money } from '../../lib/Money';
import { carColorOf } from '../../lib/carColors';
import { useSkin } from '../../lib/skin';
import ReceiptCapture, { type PendingReceipt } from './ReceiptCapture';
import { ReceiptPrinterProvider, useReceiptPrinter } from './receiptPrinter';
import type { OrderResponse, OrderStatus, BranchResponse, TableResponse, Restaurant, QrActivity, QrCartItem } from '../../lib/types';
import { BRAND } from '../../lib/brand';
import { ensureGoogleFonts, BOLD_FONTS } from '../../lib/fonts';
import { canCustomizeQr } from '../../lib/plan';
import { FONT_STACKS, type MenuFontKey } from '../customer/menuThemes';
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
import StockPage from './StockPage';
import './dashboard.css';
import './settings.css';

const DICT: Dict = {
  ar: { title: 'شاشة المطبخ', live: 'مباشر', logoutT: 'خروج', cur: 'ر.ع', min: 'د', empty: 'لا طلبات',
        nav_board: 'الطلبات المباشرة', nav_tables: 'الطاولات ورموز QR', nav_orders: 'سجل الطلبات', nav_menu: 'إدارة القائمة', nav_look: 'شكل قائمة العملاء', nav_team: 'الفريق', nav_analytics: 'التحليلات', nav_neworder: 'طلب جديد', nav_profile: 'ملف المطعم', nav_loyalty: 'الولاء', nav_loyaltySetup: 'إعدادات الولاء', nav_stock: 'المخزون', nav_settings: 'الإعدادات', more: 'المزيد',
        col_PENDING: 'جديد', col_ACCEPTED: 'قيد التنفيذ', col_PREPARING: 'قيد التحضير', col_READY: 'جاهز',
        table: 'طاولة', car: 'خدمة السيارة', note: 'ملاحظة', loyaltyReward: 'مكافأة ولاء',
        paymentTitle: 'كيف دفع العميل؟', paymentSub: 'اختر طريقة الدفع قبل إنهاء الطلب.', paymentCash: 'نقداً', paymentCard: 'بطاقة / فيزا',
        accept: 'قبول', decline: 'رفض', startPrep: 'بدء التحضير', ready: 'جاهز', complete: 'اكتمل', cancel: 'إلغاء',
        collect: 'حصّل', done: 'تم', doneUnpaid: 'تم دون دفع',
        unpaid: 'تحديد كمدفوع', paid: 'مدفوع', confirm: 'تأكيد', back: 'رجوع',
        acceptT: 'قبول الطلب', acceptP: 'كم دقيقة للتحضير؟', declineT: 'رفض الطلب', declineP: 'سبب الرفض (اختياري، يظهر للعميل)',
        cancelT: 'إلغاء الطلب', cancelP: 'سبب الإلغاء (اختياري)', reason: 'السبب',
        tablesTitle: 'الطاولات ورموز QR', addTable: '＋ طاولة', tableNumber: 'رقم الطاولة', add: 'إضافة',
        print: 'طباعة الكل', printOne: 'طباعة الرمز', printInv: 'طباعة الفاتورة', regenerate: 'تجديد الرمز', del: 'حذف', scan: 'امسح للطلب', copy: 'نسخ الرابط', copied: 'تم النسخ', carQr: 'رمز سيارات الخارج',
        qrStyle: 'تخصيص رمز QR', qrColor: 'شارة', qrInk: 'الحبر', qrFont: 'الخط', qrLogo: 'شعار الوسط',
        qrDots: 'النقاط', qrEyes: 'الزوايا', qrBadgeShape: 'شكل الشارة', qrPresets: 'قوالب جاهزة',
        qrUploadLogo: 'رفع شعار', qrRemoveLogo: 'إزالة', qrUploading: 'جارٍ الرفع…', qrPreview: 'معاينة',
        qrShuffle: 'خلط سريع', qrReset: 'الأصل',
        qrStyleHint: 'بدون شعار يظهر اسم المقهى. الشعار هنا لرموز QR فقط. اطبع بعد التعديل لتجربة المسح.',
        qrProSoon: 'تخصيص QR سيكون متاحاً في باقة أعلى قريباً.',
        qrDot_soft: 'ناعم', qrDot_square: 'مربّع', qrDot_dots: 'دوائر', qrDot_diamond: 'معين',
        qrEye_square: 'حاد', qrEye_rounded: 'مدوّر', qrEye_circle: 'دائري',
        qrBadge_brutal: 'نيوبروتال', qrBadge_flat: 'مسطّح', qrBadge_pill: 'كبسولة', qrBadge_round: 'دائري',
        qrPreset_serva: 'Serva', qrPreset_espresso: 'إسبريسو', qrPreset_ocean: 'محيط', qrPreset_sunset: 'غروب', qrPreset_mono: 'أبيض وأسود', qrPreset_candy: 'حلوى',
        qrFt_bricolage: 'Bricolage', qrFt_tajawal: 'تجوّال', qrFt_markazi: 'مركزي', qrFt_elmessiri: 'المسيري', qrFt_reemkufi: 'ريم كوفي', qrFt_sora: 'Sora',
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
        nav_board: 'Live orders', nav_tables: 'Tables & QR', nav_orders: 'Order history', nav_menu: 'Menu', nav_look: 'Customer menu look', nav_team: 'Team', nav_analytics: 'Analytics', nav_neworder: 'New order', nav_profile: 'Restaurant profile', nav_loyalty: 'Loyalty', nav_loyaltySetup: 'Loyalty settings', nav_stock: 'Stock', nav_settings: 'Settings', more: 'More',
        col_PENDING: 'New', col_ACCEPTED: 'In progress', col_PREPARING: 'Preparing', col_READY: 'Ready',
        table: 'Table', car: 'Outdoor car', note: 'Note', loyaltyReward: 'Loyalty reward',
        paymentTitle: 'How did the customer pay?', paymentSub: 'Choose the payment method before completing the order.', paymentCash: 'Cash', paymentCard: 'Card / Visa',
        accept: 'Accept', decline: 'Decline', startPrep: 'Start preparing', ready: 'Ready', complete: 'Complete', cancel: 'Cancel',
        collect: 'Collect', done: 'Done', doneUnpaid: 'Done, unpaid',
        unpaid: 'Mark paid', paid: 'Paid', confirm: 'Confirm', back: 'Back',
        acceptT: 'Accept order', acceptP: 'How many minutes to prepare?', declineT: 'Decline order', declineP: 'Reason (optional, shown to customer)',
        cancelT: 'Cancel order', cancelP: 'Cancel reason (optional)', reason: 'Reason',
        tablesTitle: 'Tables & QR codes', addTable: '＋ Table', tableNumber: 'Table number', add: 'Add',
        print: 'Print all', printOne: 'Print QR', printInv: 'Print invoice', regenerate: 'Regenerate', del: 'Delete', scan: 'Scan to order', copy: 'Copy link', copied: 'Copied', carQr: 'Outdoor car QR',
        qrStyle: 'Customize QR', qrColor: 'Badge', qrInk: 'Ink', qrFont: 'Font', qrLogo: 'Center logo',
        qrDots: 'Modules', qrEyes: 'Corners', qrBadgeShape: 'Badge shape', qrPresets: 'Presets',
        qrUploadLogo: 'Upload logo', qrRemoveLogo: 'Remove', qrUploading: 'Uploading…', qrPreview: 'Preview',
        qrShuffle: 'Quick mix', qrReset: 'Reset',
        qrStyleHint: 'Without a logo, the café name sits in the center. Logo is QR-only. Print and scan to double-check.',
        qrProSoon: 'QR customization will be a paid upgrade soon.',
        qrDot_soft: 'Soft', qrDot_square: 'Square', qrDot_dots: 'Dots', qrDot_diamond: 'Diamond',
        qrEye_square: 'Sharp', qrEye_rounded: 'Rounded', qrEye_circle: 'Circle',
        qrBadge_brutal: 'Brutal', qrBadge_flat: 'Flat', qrBadge_pill: 'Pill', qrBadge_round: 'Round',
        qrPreset_serva: 'Serva', qrPreset_espresso: 'Espresso', qrPreset_ocean: 'Ocean', qrPreset_sunset: 'Sunset', qrPreset_mono: 'Mono', qrPreset_candy: 'Candy',
        qrFt_bricolage: 'Bricolage', qrFt_tajawal: 'Tajawal', qrFt_markazi: 'Markazi', qrFt_elmessiri: 'El Messiri', qrFt_reemkufi: 'Reem Kufi', qrFt_sora: 'Sora',
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
  return <Shell />;
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

  // EventSource bakes the JWT into its URL and can't change it on auto-reconnect, so when
  // the token rotates (or expires mid-stream) we rebuild the URL and the effect reconnects.
  const [streamToken, setStreamToken] = useState(accessTokenValue);
  useEffect(() => onAuthChange(() => setStreamToken(accessTokenValue())), []);
  const streamUrl = branchId && streamToken
    ? `/api/dashboard/orders/stream?branchId=${branchId}&access_token=${encodeURIComponent(streamToken)}`
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
      // An expired JWT is the other common drop cause — swap in a fresh one if needed.
      freshStreamToken().then((tk) => { if (tk) setStreamToken((p) => (tk !== p ? tk : p)); });
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
      if (name === 'order.created') {
        ping();
        setUnacked((n) => n + 1);
        notify(t('newOrder'), o?.dailyNumber ? `#${o.dailyNumber}` : '');
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
    { key: 'stock', icon: <IcStock />, label: t('nav_stock'), show: can(user, 'STOCK') },
    { key: 'tables', icon: <IcTables />, label: t('nav_tables'), show: can(user, 'QR_TABLES') },
    { key: 'team', icon: <IcTeam />, label: t('nav_team'), show: can(user, 'TEAM') },
    // Always shown: SettingsPage gates its own sections, and Appearance is available to
    // everyone — a barista who prefers the quieter skin can switch it themselves.
    { key: 'settings', icon: <IcSettings />, label: t('nav_settings'), show: true },
  ] as { key: Page; icon: ReactNode; label: string; show: boolean }[]).filter((i) => i.show);

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

  const [branchId, setBranchId] = useState<number | undefined>(user!.branchId ?? undefined);
  // Keep the working branch on an active one: pick the first active branch when we have none yet
  // or when the branch we were on just got deactivated.
  useEffect(() => {
    if (!activeBranches.length) return;
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
  const makeBranch = useMutation({
    mutationFn: (name: string) => api.post<BranchResponse>(`/api/restaurants/${user!.restaurantId}/branches`, { name }),
    onSuccess: (b) => {
      qc.setQueryData(['branches', user!.restaurantId], (p: any) => (Array.isArray(p) ? [...p, b] : [b]));
      setBranchId(b.id);
    },
  });
  useEffect(() => {
    if (madeBranchRef.current || !needsBranch || !restaurantQ.data) return;
    madeBranchRef.current = true;
    makeBranch.mutate(restaurantQ.data.name);
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
  const printReceipt = useCallback((o: OrderResponse) => {
    setPrintQueue((prev) => [...prev, {
      order: o,
      restaurant: restaurantQ.data,
      tableNumber: o.tableId != null ? printTableNo.get(o.tableId) ?? null : null,
    }]);
  }, [restaurantQ.data, printTableNo]);

  // Shell-level so order alerts fire on every tab, not just the live board.
  const alerts = useLiveOrderAlerts(branchId, sound.ping, t);
  const calmStream = useCalmStream(alerts.stream);

  return (
    <ReceiptPrinterProvider value={printReceipt}>
    <div className="dash">
      <aside className="rail">
        <div className="logo">S.</div>
        <nav className="nav">
          {navItems.map((it) => (
            <button key={it.key} className={page === it.key ? 'on' : ''} onClick={() => setPage(it.key)} aria-label={it.label}>
              {it.icon}<span className="tip">{it.label}</span>
            </button>
          ))}
        </nav>
        <button className="out" title={t('logoutT')} aria-label={t('logoutT')} onClick={() => logout()}><IcPower /></button>
      </aside>

      <div className="dmain">
        <div className="dtop">
          <h2>{titles[page]}</h2>
          {page === 'board' && <LivePill stream={calmStream} t={t} />}
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
            branches={isManager(user) ? activeBranches : []}
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
        {page === 'analytics' && <Suspense fallback={<div className="an-msg">…</div>}><AnalyticsPage branches={isManager(user) ? activeBranches : []} /></Suspense>}
        {page === 'stock' && <StockPage branchId={branchId} />}
        {page === 'tables' && <TablesPage branchId={branchId} />}
        {/* pushes (not replaces) so the back button returns to the loyalty dashboard */}
        {page === 'loyalty' && <LoyaltyPage onOpenSetup={() => navigate('/dashboard/settings/loyalty')} />}
        {page === 'settings' && <SettingsPage section={urlSection} onSection={setSection} branchId={branchId} />}
      </div>

      <nav className="dnav-bottom">
        {primaryNav.map((it) => (
          <button key={it.key} className={page === it.key ? 'on' : ''} onClick={() => setPage(it.key)}>
            <span className="ic">{it.icon}</span><span className="lb">{it.label}</span>
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
                  <span className="more-ic">{it.icon}</span><span className="more-lb">{it.label}</span>
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
  const initials = user!.fullName.split(' ').map((s) => s[0]).slice(0, 2).join('');
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
        <div className="who-txt"><div className="nm">{user!.fullName}</div><div className="rl">{roleLabel}</div></div>
        <span className="who-caret" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="acct-menu" role="menu">
          <div className="acct-head">
            <div className="av lg">{initials}</div>
            <div className="acct-id">
              <div className="acct-name">{user!.fullName}</div>
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
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
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
  const [token, setToken] = useState(accessTokenValue);
  useEffect(() => onAuthChange(() => setToken(accessTokenValue())), []);
  useEffect(() => {
    if (!branchId) return;
    const url = `/api/dashboard/qr-activity/stream?branchId=${branchId}${token ? `&access_token=${encodeURIComponent(token)}` : ''}`;
    const es = new EventSource(url);
    const onMsg = (e: MessageEvent) => {
      try { qc.setQueryData(['qr-activity', branchId], JSON.parse(e.data) as QrActivity); } catch { /* ignore */ }
    };
    es.addEventListener('qr-activity', onMsg as EventListener);
    return () => { es.removeEventListener('qr-activity', onMsg as EventListener); es.close(); };
  }, [branchId, qc, token]);
  return data;
}

function cartPreview(cart: QrCartItem[] | undefined, lang: string, limit = 3) {
  if (!cart?.length) return '';
  const shown = cart.slice(0, limit).map((i) =>
    `${i.quantity}× ${lang === 'ar' ? (i.nameAr || i.nameEn) : (i.nameEn || i.nameAr)}`);
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
  // The stream + alerts now live in the Shell (useLiveOrderAlerts) so they fire on every
  // tab; the board just renders the cache that stream keeps warm. Tapping the shell's
  // new-order banner bumps focusSignal — jump the mobile board back to the New column.
  useEffect(() => { if (focusSignal) setMobileCol('PENDING'); }, [focusSignal]);

  const [, setTick] = useState(0);
  useEffect(() => { const i = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(i); }, []);

  const [modal, setModal] = useState<Modal>(null);
  const [field, setField] = useState('');
  const [paymentPrompt, setPaymentPrompt] = useState<{ order: OrderResponse; completeAfter: boolean } | null>(null);

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

  // Auto-print on THIS device when it completes an order (branch toggle permitting) — RawBT
  // lives on every staff device, all paired to the same printer, so no cross-device relaying.
  const printIfEnabled = (o: OrderResponse) => {
    if (branchQ.data?.printerEnabled) printReceipt(o);
  };
  const finishOrder = (o: OrderResponse, collect: boolean) => {
    const complete = () => act.mutate({ path: `/api/dashboard/orders/${o.id}/complete` }, { onSuccess: printIfEnabled });
    if (collect) requestPayment(o, true);
    else complete();
  };
  const requestPayment = (order: OrderResponse, completeAfter: boolean) => {
    if (restaurantQ.data?.paymentMethodSelectionEnabled) {
      setPaymentPrompt({ order, completeAfter });
      return;
    }
    pay.mutate({ orderId: order.id, method: 'CARD' }, {
      onSuccess: () => {
        if (completeAfter) act.mutate({ path: `/api/dashboard/orders/${order.id}/complete` }, { onSuccess: printIfEnabled });
      },
    });
  };
  const recordPayment = (method: 'CASH' | 'CARD') => {
    if (!paymentPrompt) return;
    const { order, completeAfter } = paymentPrompt;
    pay.mutate({ orderId: order.id, method }, {
      onSuccess: () => {
        setPaymentPrompt(null);
        if (completeAfter) act.mutate({ path: `/api/dashboard/orders/${order.id}/complete` }, { onSuccess: printIfEnabled });
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
                  <OrderCard key={o.id} o={o} tableNo={tableNo} t={t} lang={lang} canAccept={canAccept} canPay={canPay}
                    onAccept={() => openModal('accept', o)} onDecline={() => openModal('decline', o)} onCancel={() => openModal('cancel', o)}
                    onReady={() => act.mutate({ path: `/api/dashboard/orders/${o.id}/ready` })}
                    onComplete={() => finishOrder(o, false)} onCollect={() => finishOrder(o, true)}
                    onPay={() => requestPayment(o, false)} onPrint={() => printReceipt(o)} />
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
            <div className="ph">{t(modal.type + 'P')} · #{modal.order.dailyNumber}</div>
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
          if (e.target === e.currentTarget && !pay.isPending) setPaymentPrompt(null);
        }}>
          <div className="modal-card payment-method-modal" role="dialog" aria-modal="true" aria-labelledby="payment-method-title">
            <h3 id="payment-method-title">{t('paymentTitle')}</h3>
            <div className="ph">{t('paymentSub')} · #{paymentPrompt.order.dailyNumber}</div>
            <Money value={paymentPrompt.order.total} className="payment-method-total num" />
            <div className="payment-method-grid">
              <button className="payment-method cash" disabled={pay.isPending} onClick={() => recordPayment('CASH')}>
                <span aria-hidden="true">💵</span><b>{t('paymentCash')}</b>
              </button>
              <button className="payment-method card" disabled={pay.isPending} onClick={() => recordPayment('CARD')}>
                <span aria-hidden="true">▣</span><b>{t('paymentCard')}</b>
              </button>
            </div>
            <button className="btn ghost payment-cancel" disabled={pay.isPending} onClick={() => setPaymentPrompt(null)}>{t('back')}</button>
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

function OrderCard({ o, tableNo, t, lang, canAccept, canPay, onAccept, onDecline, onCancel, onReady, onComplete, onCollect, onPay, onPrint }: any) {
  const el = fmtElapsed(o.createdAt);
  const mins = (Date.now() - new Date(o.createdAt).getTime()) / 60000;
  const where = o.orderType === 'DINE_IN'
    ? <span className="where">🪑 <span className="tg">{t('table')} {o.tableId ? (tableNo.get(o.tableId) ?? o.tableId) : ''}</span></span>
    : <span className="where">🚗 <span className="tg">{t('car')}{o.carPlate ? ` · ${o.carPlate}` : ''}</span><CarColorTag color={o.carColor} lang={lang} /></span>;
  return (
    <div className="ocard">
      <div className="ocard-top"><span className="ordno">#{o.dailyNumber}</span><span className={'elapsed' + (mins > 10 ? ' late' : mins > 5 ? ' warn' : '')}>{el}</span>
        <button className="oprint" title={t('printInv')} aria-label={t('printInv')} onClick={onPrint}>🖨</button></div>
      {where}
      {o.status === 'ACCEPTED' && o.prepTimeMinutes ? <span className="where" style={{ color: 'var(--accepted)' }}>⏱ ~ <span className="num">{o.prepTimeMinutes}</span> {t('min')}</span> : null}
      <div className="olines">
        {o.items.map((i: any) => (
          <div className="ln" key={i.id}><span className="q num">{i.quantity}×</span>
            <span>{lang === 'ar' ? (i.nameAr || i.nameEn) : (i.nameEn || i.nameAr)}{i.note ? <span className="nt">↳ {i.note}</span> : null}</span></div>
        ))}
      </div>
      {o.loyaltyRewardLabel && <div className="oreward"><b>🎁 {t('loyaltyReward')}</b> {o.loyaltyRewardLabel}{o.loyaltyRewardDiscount ? <> · <Money value={-o.loyaltyRewardDiscount} className="num" /></> : null}</div>}
      {o.customerNote && <div className="onote"><b>{t('note')}:</b> {o.customerNote}{o.customerName ? ` — ${o.customerName}` : ''}</div>}
      <div className="ocard-foot">
        <Money value={o.total} className="ototal num" />
        {o.paymentStatus === 'PAID' ? <span className="pay paid">✓ {t('paid')}</span>
          : canPay ? <span className="pay unpaid" onClick={onPay}>{t('unpaid')}</span>
          : <span className="pay unpaid static">{t('unpaid')}</span>}
      </div>
      {/* Kitchen-only staff (no ORDERS) advance tickets (Start preparing / Ready) but can't accept,
          cancel or complete — those stay gated to ORDERS so the buttons never 403. */}
      <div className="oactions">
        {o.status === 'PENDING' && canAccept && <><button className="btn sm" onClick={onAccept}>{t('accept')}</button><button className="btn sm ghost" onClick={onDecline}>{t('decline')}</button></>}
        {(o.status === 'ACCEPTED' || o.status === 'PREPARING') && <><button className="btn sm" onClick={onReady}>{t('ready')}</button>{canAccept && <button className="btn sm danger" onClick={onCancel}>{t('cancel')}</button>}</>}
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
/* Bold-style QR: we render the matrix ourselves as inline SVG so the pattern
   matches the landing poster — ink "dot" modules, rounded finder eyes — and the
   center badge is real inline <text> (an embedded <image> logo uses a separate
   square chip). Error correction stays at H so the rounded modules + cleared
   badge area still scan. No logo → café name in the same neobrutalist pill. */
const fmt = (v: number) => Math.round(v * 100) / 100;
const roundRectPath = (x: number, y: number, w: number, h: number, r: number) => {
  const rad = Math.min(r, w / 2, h / 2);
  return `M${fmt(x + rad)} ${fmt(y)}h${fmt(w - 2 * rad)}a${fmt(rad)} ${fmt(rad)} 0 0 1 ${fmt(rad)} ${fmt(rad)}`
    + `v${fmt(h - 2 * rad)}a${fmt(rad)} ${fmt(rad)} 0 0 1 ${fmt(-rad)} ${fmt(rad)}`
    + `h${fmt(-(w - 2 * rad))}a${fmt(rad)} ${fmt(rad)} 0 0 1 ${fmt(-rad)} ${fmt(-rad)}`
    + `v${fmt(-(h - 2 * rad))}a${fmt(rad)} ${fmt(rad)} 0 0 1 ${fmt(rad)} ${fmt(-rad)}z`;
};

// Hardcoded hex (not CSS vars) so print portal SVG stays correct without app stylesheets.
const QR_INK = '#15181C';
const QR_ACCENT = '#10b981';

/** Fonts for the text badge. */
type QrFontId = 'bricolage' | Extract<MenuFontKey, 'tajawal' | 'markazi' | 'elmessiri' | 'reemkufi' | 'sora'>;
const QR_FONT_STACK: Record<QrFontId, string> = {
  bricolage: "'Bricolage Grotesque','IBM Plex Sans Arabic',system-ui,sans-serif",
  tajawal: FONT_STACKS.tajawal,
  markazi: FONT_STACKS.markazi,
  elmessiri: FONT_STACKS.elmessiri,
  reemkufi: FONT_STACKS.reemkufi,
  sora: FONT_STACKS.sora,
};
const QR_FONT_IDS = Object.keys(QR_FONT_STACK) as QrFontId[];
const QR_FONT_GOOGLE: Partial<Record<QrFontId, string[]>> = {
  bricolage: BOLD_FONTS,
  tajawal: ['Tajawal:wght@400;500;700;800'],
  markazi: ['Markazi+Text:wght@400;500;600;700'],
  elmessiri: ['El+Messiri:wght@500;600;700'],
  reemkufi: ['Reem+Kufi:wght@500;600;700'],
  sora: ['Sora:wght@600;700;800'],
};

type QrDotStyle = 'soft' | 'square' | 'dots' | 'diamond';
type QrEyeStyle = 'square' | 'rounded' | 'circle';
type QrBadgeShape = 'brutal' | 'flat' | 'pill' | 'round';
const QR_DOT_IDS: QrDotStyle[] = ['soft', 'square', 'dots', 'diamond'];
const QR_EYE_IDS: QrEyeStyle[] = ['square', 'rounded', 'circle'];
const QR_BADGE_SHAPE_IDS: QrBadgeShape[] = ['brutal', 'flat', 'pill', 'round'];

/** Shared palette for ink + badge. Paper is always pure white (scan reliability). */
const QR_PALETTE: { id: string; fill: string }[] = [
  { id: 'lime', fill: QR_ACCENT },
  { id: 'ink', fill: QR_INK },
  { id: 'black', fill: '#0A0A0A' },
  { id: 'navy', fill: '#1B2A4A' },
  { id: 'espresso', fill: '#3D2314' },
  { id: 'burgundy', fill: '#6B1D3A' },
  { id: 'forest', fill: '#1F4D3A' },
  { id: 'coral', fill: '#FF6B4A' },
  { id: 'sky', fill: '#5B9FFF' },
  { id: 'violet', fill: '#7C5CFC' },
  { id: 'gold', fill: '#E8B84A' },
  { id: 'cream', fill: '#F5E6C8' },
  { id: 'blush', fill: '#FFD6E0' },
  { id: 'mint', fill: '#C8F5E4' },
  { id: 'white', fill: '#FFFFFF' },
];
const QR_PALETTE_MAP = Object.fromEntries(QR_PALETTE.map((c) => [c.id, c.fill])) as Record<string, string>;
/** Inks dark enough to scan on white paper. */
const QR_INK_IDS = ['ink', 'black', 'navy', 'espresso', 'burgundy', 'forest', 'violet'] as const;
const QR_BADGE_COLOR_IDS = QR_PALETTE.map((c) => c.id);
const QR_PAPER = '#ffffff';

/**
 * Per-café QR style blob (localStorage now → restaurant field when paid).
 * `badgeImageUrl` is QR-only — never restaurant.logoUrl.
 * Paper is fixed white (not stored / not customizable).
 */
type QrBadgeStyle = {
  colorId: string;
  inkId: string;
  fontId: QrFontId;
  dotStyle: QrDotStyle;
  eyeStyle: QrEyeStyle;
  badgeShape: QrBadgeShape;
  badgeImageUrl?: string | null;
};
const DEFAULT_QR_STYLE: QrBadgeStyle = {
  colorId: 'lime', inkId: 'ink',
  fontId: 'bricolage', dotStyle: 'soft', eyeStyle: 'square', badgeShape: 'brutal',
  badgeImageUrl: null,
};

type QrPreset = { id: string; style: Partial<QrBadgeStyle>; swatch: [string, string, string] };
const QR_PRESETS: QrPreset[] = [
  { id: 'serva', style: { ...DEFAULT_QR_STYLE }, swatch: [QR_INK, QR_ACCENT, '#fff'] },
  { id: 'espresso', style: { inkId: 'espresso', colorId: 'gold', fontId: 'markazi', dotStyle: 'soft', eyeStyle: 'rounded', badgeShape: 'pill' }, swatch: ['#3D2314', '#E8B84A', '#fff'] },
  { id: 'ocean', style: { inkId: 'navy', colorId: 'sky', fontId: 'sora', dotStyle: 'dots', eyeStyle: 'circle', badgeShape: 'round' }, swatch: ['#1B2A4A', '#5B9FFF', '#fff'] },
  { id: 'sunset', style: { inkId: 'burgundy', colorId: 'coral', fontId: 'elmessiri', dotStyle: 'diamond', eyeStyle: 'rounded', badgeShape: 'brutal' }, swatch: ['#6B1D3A', '#FF6B4A', '#fff'] },
  { id: 'mono', style: { inkId: 'black', colorId: 'white', fontId: 'bricolage', dotStyle: 'square', eyeStyle: 'square', badgeShape: 'flat' }, swatch: ['#0A0A0A', '#fff', '#eee'] },
  { id: 'candy', style: { inkId: 'violet', colorId: 'violet', fontId: 'reemkufi', dotStyle: 'dots', eyeStyle: 'circle', badgeShape: 'pill' }, swatch: ['#7C5CFC', '#C8F5E4', '#fff'] },
];

/**
 * Hand-tuned combos for "Quick mix" — same idea as menu theme PALETTE_RECIPES:
 * pick a designed ink/badge pair, then randomize shapes/font. Paper is always white.
 */
type QrMixRecipe = Pick<QrBadgeStyle, 'inkId' | 'colorId'>;
const QR_MIX_RECIPES: QrMixRecipe[] = [
  { inkId: 'ink', colorId: 'lime' },
  { inkId: 'espresso', colorId: 'gold' },
  { inkId: 'espresso', colorId: 'coral' },
  { inkId: 'navy', colorId: 'sky' },
  { inkId: 'navy', colorId: 'lime' },
  { inkId: 'burgundy', colorId: 'coral' },
  { inkId: 'burgundy', colorId: 'gold' },
  { inkId: 'forest', colorId: 'lime' },
  { inkId: 'forest', colorId: 'gold' },
  { inkId: 'violet', colorId: 'violet' },
  { inkId: 'violet', colorId: 'coral' },
  { inkId: 'black', colorId: 'white' },
  { inkId: 'black', colorId: 'ink' },
  { inkId: 'ink', colorId: 'coral' },
  { inkId: 'navy', colorId: 'cream' },
  { inkId: 'espresso', colorId: 'cream' },
];

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

/** Fresh random look from curated recipes — keeps logo, avoids repeating the last palette. */
function randomQrStyle(current: QrBadgeStyle): QrBadgeStyle {
  const pool = QR_MIX_RECIPES.filter(
    (r) => !(r.inkId === current.inkId && r.colorId === current.colorId),
  );
  const recipe = pick(pool.length ? pool : QR_MIX_RECIPES);
  return {
    ...DEFAULT_QR_STYLE,
    ...recipe,
    fontId: pick(QR_FONT_IDS),
    dotStyle: pick(QR_DOT_IDS),
    eyeStyle: pick(QR_EYE_IDS),
    badgeShape: pick(QR_BADGE_SHAPE_IDS),
    // Logo is intentional branding — don't wipe it on shuffle (same as presets).
    badgeImageUrl: current.badgeImageUrl ?? null,
  };
}

function loadQrStyle(restaurantId?: number | null): QrBadgeStyle {
  if (!restaurantId) return { ...DEFAULT_QR_STYLE };
  try {
    const raw = localStorage.getItem(`serva.qrBadge.${restaurantId}`);
    if (!raw) return { ...DEFAULT_QR_STYLE };
    const p = JSON.parse(raw) as Partial<QrBadgeStyle>;
    return {
      colorId: QR_BADGE_COLOR_IDS.includes(p.colorId!) ? p.colorId! : DEFAULT_QR_STYLE.colorId,
      inkId: (QR_INK_IDS as readonly string[]).includes(p.inkId!) ? p.inkId! : DEFAULT_QR_STYLE.inkId,
      fontId: QR_FONT_IDS.includes(p.fontId as QrFontId) ? (p.fontId as QrFontId) : DEFAULT_QR_STYLE.fontId,
      dotStyle: QR_DOT_IDS.includes(p.dotStyle as QrDotStyle) ? (p.dotStyle as QrDotStyle) : DEFAULT_QR_STYLE.dotStyle,
      eyeStyle: QR_EYE_IDS.includes(p.eyeStyle as QrEyeStyle) ? (p.eyeStyle as QrEyeStyle) : DEFAULT_QR_STYLE.eyeStyle,
      badgeShape: QR_BADGE_SHAPE_IDS.includes(p.badgeShape as QrBadgeShape) ? (p.badgeShape as QrBadgeShape) : DEFAULT_QR_STYLE.badgeShape,
      badgeImageUrl: typeof p.badgeImageUrl === 'string' && p.badgeImageUrl.trim() ? p.badgeImageUrl.trim() : null,
    };
  } catch {
    return { ...DEFAULT_QR_STYLE };
  }
}
function saveQrStyle(restaurantId: number | null | undefined, style: QrBadgeStyle) {
  if (!restaurantId) return;
  try { localStorage.setItem(`serva.qrBadge.${restaurantId}`, JSON.stringify(style)); } catch { /* ignore */ }
}

function qrHex(id: string, fallback: string): string {
  return QR_PALETTE_MAP[id] ?? fallback;
}

/** Perceived luminance → pick ink vs white text on the badge fill. */
function qrTextOn(fill: string, ink = QR_INK): string {
  const hex = fill.replace('#', '');
  if (hex.length !== 6) return ink;
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  const lum = (r * 299 + g * 587 + b * 114) / 1000;
  return lum < 150 ? '#FFFFFF' : ink;
}

const circlePath = (cx: number, cy: number, r: number) =>
  `M${fmt(cx - r)} ${fmt(cy)}a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(r * 2)} 0a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-r * 2)} 0`;

const diamondPath = (x: number, y: number, w: number, h: number) => {
  const cx = x + w / 2, cy = y + h / 2;
  return `M${fmt(cx)} ${fmt(y)}L${fmt(x + w)} ${fmt(cy)}L${fmt(cx)} ${fmt(y + h)}L${fmt(x)} ${fmt(cy)}Z`;
};

function modulePath(style: QrDotStyle, x: number, y: number, cell: number): string {
  if (style === 'square') return roundRectPath(x, y, cell, cell, 0);
  if (style === 'dots') return circlePath(x + cell / 2, y + cell / 2, cell * 0.46);
  if (style === 'diamond') return diamondPath(x + cell * 0.06, y + cell * 0.06, cell * 0.88, cell * 0.88);
  return roundRectPath(x, y, cell, cell, cell * 0.22);
}

function eyePath(style: QrEyeStyle, x: number, y: number, cell: number): string {
  const s = cell * 7;
  if (style === 'circle') {
    const cx = x + s / 2, cy = y + s / 2;
    // outer ring + white gap + pupil via even-odd
    return `${circlePath(cx, cy, s * 0.5)}${circlePath(cx, cy, s * 0.36)}${circlePath(cx, cy, s * 0.22)}`;
  }
  if (style === 'rounded') {
    const r = cell * 1.1;
    return `${roundRectPath(x, y, s, s, r)}${roundRectPath(x + cell, y + cell, cell * 5, cell * 5, r * 0.7)}${roundRectPath(x + cell * 2, y + cell * 2, cell * 3, cell * 3, r * 0.5)}`;
  }
  // sharp / square
  return `${roundRectPath(x, y, s, s, cell * 0.45)}${roundRectPath(x + cell, y + cell, cell * 5, cell * 5, cell * 0.32)}${roundRectPath(x + cell * 2, y + cell * 2, cell * 3, cell * 3, cell * 0.24)}`;
}

/** Shared canvas for measuring badge text against real font metrics. */
let _qrMeasureCtx: CanvasRenderingContext2D | null = null;
function qrMeasureCtx(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!_qrMeasureCtx) {
    const c = document.createElement('canvas');
    _qrMeasureCtx = c.getContext('2d');
  }
  return _qrMeasureCtx;
}

/**
 * Largest font size that keeps `label` inside the chip. Uses canvas measureText
 * so wide display faces (Reem Kufi, Markazi, etc.) don't blow past the pill.
 * Height is capped hard — bold Arabic fonts have tall vertical metrics at 800.
 */
function fitBadgeFontSize(label: string, fontStack: string, maxW: number, maxH: number): number {
  if (!label) return maxH * 0.4;
  // Display faces at weight 800 routinely overshoot the em box; keep a generous air gap.
  const maxByHeight = maxH * 0.42;
  const minFs = Math.max(5, maxH * 0.22);
  const ctx = qrMeasureCtx();
  if (!ctx) {
    // SSR / no canvas — conservative char-unit fallback.
    let units = 0;
    for (const ch of label) {
      if (/\s|[·.,،]/.test(ch)) units += 0.28;
      else if (ch.charCodeAt(0) > 0x0600) units += 1.05;
      else units += 0.62;
    }
    return Math.max(minFs, Math.min(maxByHeight, maxW / Math.max(units, 1)));
  }
  // Binary search the largest size that still fits maxW.
  let lo = minFs, hi = maxByHeight, best = minFs;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    ctx.font = `800 ${mid}px ${fontStack}`;
    // letter-spacing -0.02em is applied in SVG; approximate here.
    const w = ctx.measureText(label).width * 0.98;
    if (w <= maxW) { best = mid; lo = mid; }
    else hi = mid;
  }
  return best;
}

/** Text-badge envelope — fixed-ish pill so scan area stays predictable. */
function textBadgeSize(size: number, label: string): { bw: number; bh: number } {
  const len = Math.max(1, [...label].length);
  // Wider for longer names, but never more than ~half the QR (ECC-H budget).
  const bw = size * Math.min(0.52, Math.max(0.30, 0.18 + len * 0.024));
  // Slightly taller pill so font has room without looking cramped.
  const bh = size * (len > 12 ? 0.148 : 0.138);
  return { bw, bh };
}

function BrandedQrCode({ value, size, marginSize = 1, badge = true, style, label }: {
  value: string; size: number; marginSize?: number; badge?: boolean;
  style?: QrBadgeStyle; label?: string | null;
}) {
  const s = style ?? DEFAULT_QR_STYLE;
  const ink = qrHex(s.inkId, QR_INK);
  const paper = QR_PAPER; // always pure white — never customized
  const badgeFill = qrHex(s.colorId, QR_ACCENT);
  const stack = QR_FONT_STACK[s.fontId] ?? QR_FONT_STACK.bricolage;
  const badgeImageUrl = s.badgeImageUrl;
  const clipId = useId();
  const textClipId = `${clipId}-txt`;
  const hasLogo = badge && !!badgeImageUrl;
  const mark = (label && label.trim()) || BRAND.name;
  const textLabel = hasLogo ? '' : mark;
  const { bw: textBw, bh: textBh } = textBadgeSize(size, textLabel || BRAND.name);

  const [fontTick, setFontTick] = useState(0);
  useEffect(() => {
    if (hasLogo || typeof document === 'undefined' || !document.fonts) return;
    let cancelled = false;
    document.fonts.ready.then(() => { if (!cancelled) setFontTick((n) => n + 1); });
    document.fonts.load(`800 16px ${stack}`).then(() => { if (!cancelled) setFontTick((n) => n + 1); }).catch(() => {});
    return () => { cancelled = true; };
  }, [stack, hasLogo, textLabel]);

  const { cells, eyes, cell } = useMemo(() => {
    const { modules } = createQrMatrix(value, { errorCorrectionLevel: 'H' });
    const n = modules.size;
    const dim = n + marginSize * 2;
    const cell = size / dim;
    const off = marginSize * cell;
    const px = (i: number) => off + i * cell;
    const isFinder = (r: number, c: number) =>
      (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
    const bw = badge ? (hasLogo ? size * 0.26 : textBw) : 0;
    const bh = badge ? (hasLogo ? size * 0.26 : textBh) : 0;
    const bx = (size - bw) / 2, by = (size - bh) / 2, bpad = cell * 0.75;
    const inBadge = (cx: number, cy: number) =>
      badge && cx > bx - bpad && cx < bx + bw + bpad && cy > by - bpad && cy < by + bh + bpad;

    let cells = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!modules.get(r, c) || isFinder(r, c)) continue;
        const cx = px(c) + cell / 2, cy = px(r) + cell / 2;
        if (inBadge(cx, cy)) continue;
        cells += modulePath(s.dotStyle, px(c), px(r), cell);
      }
    }
    const eyes = `${eyePath(s.eyeStyle, px(0), px(0), cell)}${eyePath(s.eyeStyle, px(n - 7), px(0), cell)}${eyePath(s.eyeStyle, px(0), px(n - 7), cell)}`;
    return { cells, eyes, cell };
  }, [value, size, marginSize, badge, hasLogo, textBw, textBh, s.dotStyle, s.eyeStyle]);

  const bw = hasLogo ? size * 0.26 : textBw;
  const bh = hasLogo ? size * 0.26 : textBh;
  const bx = (size - bw) / 2, by = (size - bh) / 2;
  const badgeBorder = Math.max(2, size * 0.013);
  const badgeSh = s.badgeShape === 'brutal' ? Math.max(2, size * 0.016) : 0;
  // Shape radius: round ≈ circle (logo), pill = capsule, flat/brutal = tight.
  const badgeR = s.badgeShape === 'round' ? Math.min(bw, bh) / 2
    : s.badgeShape === 'pill' ? Math.min(bw, bh) / 2
    : hasLogo ? bw * 0.18
    : bh * 0.16;
  const logoInset = bw * 0.14;
  const textFill = qrTextOn(badgeFill, ink);
  const textPadX = Math.max(badgeBorder + 2, bw * 0.08);
  const textPadY = Math.max(badgeBorder + 1, bh * 0.12);
  const fontSize = useMemo(
    () => fitBadgeFontSize(textLabel, stack, bw - textPadX * 2, bh - textPadY * 2),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [textLabel, stack, bw, bh, textPadX, textPadY, fontTick],
  );
  const isLatinOnly = /^[\x00-\x7F]*$/.test(textLabel);
  const innerR = Math.max(0, badgeR - badgeBorder);
  // Clear under badge uses paper so the quiet zone matches the QR paper tint.
  const clearPad = cell * 0.9;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" shapeRendering="geometricPrecision">
      <rect width={size} height={size} fill={paper} />
      <path d={cells} fill={ink} />
      <path d={eyes} fill={ink} fillRule="evenodd" />
      {badge && (
        <>
          <path d={roundRectPath(bx - clearPad, by - clearPad, bw + clearPad * 2 + badgeSh, bh + clearPad * 2 + badgeSh, clearPad * 0.5)} fill={paper} />
          {badgeSh > 0 && (
            <path d={roundRectPath(bx + badgeSh, by + badgeSh, bw, bh, badgeR)} fill={ink} />
          )}
          {hasLogo ? (
            <>
              <path d={roundRectPath(bx, by, bw, bh, badgeR)} fill="#ffffff" stroke={ink} strokeWidth={badgeBorder} />
              <clipPath id={clipId}>
                <path d={roundRectPath(bx + badgeBorder, by + badgeBorder, bw - badgeBorder * 2, bh - badgeBorder * 2, innerR)} />
              </clipPath>
              <image href={badgeImageUrl!} x={bx + logoInset} y={by + logoInset} width={bw - logoInset * 2} height={bh - logoInset * 2}
                preserveAspectRatio="xMidYMid meet" clipPath={`url(#${clipId})`} />
            </>
          ) : (
            <>
              <path d={roundRectPath(bx, by, bw, bh, badgeR)} fill={badgeFill} stroke={ink} strokeWidth={badgeBorder} />
              <clipPath id={textClipId}>
                <path d={roundRectPath(bx + badgeBorder, by + badgeBorder, bw - badgeBorder * 2, bh - badgeBorder * 2, innerR)} />
              </clipPath>
              <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
                direction={isLatinOnly ? 'ltr' : 'auto'}
                unicodeBidi={isLatinOnly ? 'bidi-override' : 'normal'}
                fontFamily={stack}
                fontWeight={800} fontSize={fontSize} letterSpacing="-0.02em" fill={textFill}
                clipPath={`url(#${textClipId})`}>
                {isLatinOnly ? `${textLabel}\u200E` : textLabel}
              </text>
            </>
          )}
        </>
      )}
    </svg>
  );
}
type PrintQrJob = { title: string; subtitle?: string; value: string };

function TablesPage({ branchId }: { branchId?: number }) {
  const t = useT(DICT);
  const { lang } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [num, setNum] = useState('');
  const [singlePrint, setSinglePrint] = useState<PrintQrJob | null>(null);
  const [qrStyle, setQrStyle] = useState<QrBadgeStyle>(() => loadQrStyle(user?.restaurantId));
  const [qrLogoUploading, setQrLogoUploading] = useState(false);
  const qrLogoRef = useRef<HTMLInputElement>(null);

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

  // Gate: currently open for all plans; flip canCustomizeQr() when this becomes paid.
  const qrCustom = canCustomizeQr(restaurant?.plan);
  const setQrStylePersist = (next: QrBadgeStyle) => {
    if (!qrCustom) return;
    setQrStyle(next);
    saveQrStyle(user?.restaurantId, next);
  };
  const patchQr = (partial: Partial<QrBadgeStyle>) => setQrStylePersist({ ...qrStyle, ...partial });
  const restaurantSlug = restaurant?.slug;
  const cafeName = restaurant?.name?.trim() || '';
  // Locked plans always get the free default look.
  const effectiveStyle: QrBadgeStyle = qrCustom ? qrStyle : { ...DEFAULT_QR_STYLE };
  const hasBadgeImage = !!effectiveStyle.badgeImageUrl;
  const previewValue = carUrlOf(restaurantSlug || 'demo', branchId || 1);
  const carUrl = branchId && restaurantSlug ? carUrlOf(restaurantSlug, branchId) : null;
  const invalidate = () => qc.invalidateQueries({ queryKey: ['tables', branchId] });

  async function onQrLogoFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !qrCustom) return;
    setQrLogoUploading(true);
    try {
      // Reuse the logo upload endpoint for storage; we never write restaurant.logoUrl.
      const { url } = await upload('/api/uploads/restaurants/logo', file);
      patchQr({ badgeImageUrl: url });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setQrLogoUploading(false);
      if (qrLogoRef.current) qrLogoRef.current.value = '';
    }
  }

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
        <button className="btn sm ghost" disabled={!tables.length && !carUrl} onClick={printAll}>🖨 {t('print')}</button>
      </div>

      {/* Full QR studio — presets, ink/paper/badge colors, module & eye shapes, logo, font.
          Independent of restaurant profile logo. Gated by canCustomizeQr for future PRO. */}
      <div className={'qr-style' + (qrCustom ? '' : ' locked')} aria-label={t('qrStyle')}>
        <div className="qr-style-top">
          <div className="qr-style-head">{t('qrStyle')}</div>
          {qrCustom && (
            <div className="qr-style-actions">
              <button className="btn sm ghost" type="button"
                onClick={() => setQrStylePersist(randomQrStyle(qrStyle))}>
                🎲 {t('qrShuffle')}
              </button>
              <button className="btn sm ghost" type="button"
                onClick={() => setQrStylePersist({
                  ...DEFAULT_QR_STYLE,
                  badgeImageUrl: qrStyle.badgeImageUrl ?? null,
                })}>
                {t('qrReset')}
              </button>
            </div>
          )}
        </div>
        {qrCustom ? (
          <div className="qr-style-body">
            <div className="qr-style-preview" aria-label={t('qrPreview')}>
              <BrandedQrCode value={previewValue} size={148} style={effectiveStyle} label={cafeName} />
            </div>
            <div className="qr-style-controls">
              <div className="qr-style-row">
                <span className="qr-style-lbl">{t('qrPresets')}</span>
                <div className="qr-presets">
                  {QR_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="qr-preset"
                      title={t('qrPreset_' + p.id)}
                      onClick={() => setQrStylePersist({
                        ...DEFAULT_QR_STYLE,
                        ...p.style,
                        badgeImageUrl: qrStyle.badgeImageUrl, // keep uploaded logo across presets
                      })}
                    >
                      <span className="qr-preset-swatch">
                        <i style={{ background: p.swatch[0] }} />
                        <i style={{ background: p.swatch[1] }} />
                        <i style={{ background: p.swatch[2] }} />
                      </span>
                      <b>{t('qrPreset_' + p.id)}</b>
                    </button>
                  ))}
                </div>
              </div>

              <div className="qr-style-row">
                <span className="qr-style-lbl">{t('qrLogo')}</span>
                <div className="qr-logo-ctl">
                  {hasBadgeImage && (
                    <span className="qr-logo-thumb" style={{ backgroundImage: `url('${effectiveStyle.badgeImageUrl}')` }} />
                  )}
                  <input ref={qrLogoRef} type="file" accept="image/*" hidden onChange={onQrLogoFile} />
                  <button className="btn sm ghost" type="button" disabled={qrLogoUploading}
                    onClick={() => qrLogoRef.current?.click()}>
                    {qrLogoUploading ? t('qrUploading') : t('qrUploadLogo')}
                  </button>
                  {hasBadgeImage && (
                    <button className="btn sm danger" type="button" disabled={qrLogoUploading}
                      onClick={() => patchQr({ badgeImageUrl: null })}>
                      {t('qrRemoveLogo')}
                    </button>
                  )}
                </div>
              </div>

              <div className="qr-style-row">
                <span className="qr-style-lbl">{t('qrInk')}</span>
                <div className="qr-swatches">
                  {QR_INK_IDS.map((id) => (
                    <button key={id} type="button"
                      className={'qr-swatch' + (qrStyle.inkId === id ? ' on' : '')}
                      style={{ background: qrHex(id, QR_INK) }}
                      title={id} aria-label={id}
                      onClick={() => patchQr({ inkId: id })} />
                  ))}
                </div>
              </div>

              <div className={'qr-style-row' + (hasBadgeImage ? ' dim' : '')}>
                <span className="qr-style-lbl">{t('qrColor')}</span>
                <div className="qr-swatches">
                  {QR_PALETTE.map((c) => (
                    <button key={c.id} type="button"
                      className={'qr-swatch' + (qrStyle.colorId === c.id ? ' on' : '')}
                      style={{ background: c.fill }}
                      title={c.id} aria-label={c.id}
                      disabled={hasBadgeImage}
                      onClick={() => patchQr({ colorId: c.id })} />
                  ))}
                </div>
              </div>

              <div className="qr-style-row">
                <span className="qr-style-lbl">{t('qrDots')}</span>
                <div className="qr-fonts">
                  {QR_DOT_IDS.map((id) => (
                    <button key={id} type="button"
                      className={'qr-font' + (qrStyle.dotStyle === id ? ' on' : '')}
                      onClick={() => patchQr({ dotStyle: id })}>
                      {t('qrDot_' + id)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="qr-style-row">
                <span className="qr-style-lbl">{t('qrEyes')}</span>
                <div className="qr-fonts">
                  {QR_EYE_IDS.map((id) => (
                    <button key={id} type="button"
                      className={'qr-font' + (qrStyle.eyeStyle === id ? ' on' : '')}
                      onClick={() => patchQr({ eyeStyle: id })}>
                      {t('qrEye_' + id)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="qr-style-row">
                <span className="qr-style-lbl">{t('qrBadgeShape')}</span>
                <div className="qr-fonts">
                  {QR_BADGE_SHAPE_IDS.map((id) => (
                    <button key={id} type="button"
                      className={'qr-font' + (qrStyle.badgeShape === id ? ' on' : '')}
                      onClick={() => patchQr({ badgeShape: id })}>
                      {t('qrBadge_' + id)}
                    </button>
                  ))}
                </div>
              </div>

              <div className={'qr-style-row' + (hasBadgeImage ? ' dim' : '')}>
                <span className="qr-style-lbl">{t('qrFont')}</span>
                <div className="qr-fonts">
                  {QR_FONT_IDS.map((id) => (
                    <button key={id} type="button"
                      className={'qr-font' + (qrStyle.fontId === id ? ' on' : '')}
                      style={{ fontFamily: QR_FONT_STACK[id] }}
                      disabled={hasBadgeImage}
                      onClick={() => patchQr({ fontId: id })}>
                      {t('qrFt_' + id)}
                    </button>
                  ))}
                </div>
              </div>

              <p className="qr-style-hint">{t('qrStyleHint')}</p>
            </div>
          </div>
        ) : (
          <p className="qr-style-hint">{t('qrProSoon')}</p>
        )}
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
