import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, upload, ApiError } from '../../lib/api';
import { useAuth, can } from '../../lib/auth';
import { useI18n, useT, type Dict } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import { getLastPrintAttempt, type PrintAttempt } from '../../lib/printer';
import { parseReceiptSettings, RECEIPT_DEFAULTS, type ReceiptSettings, type ReceiptStyle } from '../../lib/receiptSettings';
import { useReceiptPrinter } from './receiptPrinter';
import ReceiptSheet from './ReceiptSheet';
import { SettingsShell, PaneSection, Specimen, MiniQr } from './SettingsShell';
import { isProPlan } from '../../lib/plan';
import type { Restaurant, Subscription, BranchResponse, OrderResponse } from '../../lib/types';

/* This file used to render one long "Restaurant profile" page (hero + 4 numbered
 * sections + an aside). Settings now houses each section as its own pane, so the
 * sections below are exported individually and mounted one at a time by
 * SettingsPage.tsx — each wearing the shared SettingsShell (hero + sections +
 * a sticky aside holding a live specimen of what the pane produces). None of the
 * form/query/mutation logic changed in the split or the reskin. */

const DICT: Dict = {
  ar: {
    title: 'ملف المطعم', sub: 'البيانات التي تظهر في قائمة العملاء والفواتير.',
    detailsTitle: 'بيانات المطعم', detailsSub: 'معلومات التواصل والهوية التي يراها عملاؤك.',
    operationsTitle: 'الطلبات والضريبة', operationsSub: 'إعدادات التشغيل التي تؤثر على التحصيل والفواتير.',
    branchTitle: 'الفرع ورابط القائمة', branchSub: 'إدارة اسم الفرع الحالي وعنوان القائمة العامة.',
    vatHelp: 'أظهر ضريبة القيمة المضافة في الطلبات والفواتير.',
    menuLinkHelp: 'هذا هو الرابط العام الذي يفتحه عملاؤك.',
    name: 'اسم المطعم', phone: 'الهاتف', email: 'البريد', instagram: 'إنستجرام',
    currency: 'العملة', vatEnabled: 'تفعيل الضريبة', vatRate: 'نسبة الضريبة', logo: 'شعار المطعم',
    paymentSelection: 'اختيار طريقة الدفع عند التحصيل', paymentSelectionSub: 'عند التفعيل، يختار الموظف نقداً أو بطاقة قبل إنهاء الطلب. عند الإيقاف، تُسجّل البطاقة افتراضياً.',
    uploadLogo: 'رفع الشعار', removeLogo: 'إزالة الشعار', logoRemoved: 'تم إزالة الشعار', uploading: 'جارٍ الرفع...', save: 'حفظ الملف', saved: 'تم الحفظ', openMenu: 'فتح القائمة',
    slug: 'رابط القائمة', active: 'نشط',
    subscription: 'الاشتراك', plan: 'الباقة', sstatus: 'الحالة', renews: 'يتجدد', ended: 'انتهى',
    oneTime: 'دفع مرة واحدة', access: 'الوصول', lifetime: 'مدى الحياة',
    branchName: 'اسم الفرع', saveBranch: 'حفظ', branchSaved: 'تم حفظ الفرع',
    printerEnabled: 'الطباعة التلقائية للفواتير', printerEnabledSub: 'عند التفعيل، تُطبع الفاتورة من الجهاز الذي أنهى الطلب. ثبّت تطبيق RawBT على كل جهاز موظفين واربطه بالطابعة نفسها.',
    testPrint: 'طباعة تجريبية', testPrintSent: 'أُرسلت الطباعة التجريبية',
    lastSent: 'آخر إرسال للطابعة', buildLabel: 'إصدار التطبيق',
    receiptTitle: 'تخصيص الفاتورة', receiptSub: 'أضف لمستك على الفاتورة المطبوعة — الشكل، الشعار، ورسالتك الخاصة.',
    rcptStyle: 'شكل الفاتورة', rcptClassic: 'كلاسيكي', rcptMinimal: 'بسيط', rcptBold: 'جريء',
    rcptRetro: 'ريترو', rcptFancy: 'فاخر', rcptTicket: 'تذكرة',
    rcptShowLogo: 'إظهار الشعار أعلى الفاتورة', rcptNoLogo: 'ارفع شعاراً أولاً من أعلى الصفحة.',
    rcptShowPhone: 'إظهار رقم الهاتف', rcptNoPhone: 'أضف رقم الهاتف أولاً في بيانات المطعم.',
    rcptFooter: 'رسالة أسفل الفاتورة', rcptFooterPh: 'مثال: تابعونا على إنستجرام @cafe · واي فاي: guest123',
    rcptVatNo: 'الرقم الضريبي (VAT)', rcptCrNo: 'السجل التجاري (CR)',
    rcptSave: 'حفظ الفاتورة', rcptSaved: 'تم حفظ إعدادات الفاتورة', rcptPreview: 'معاينة حية',
    st_PENDING_PAYMENT: 'بانتظار الدفع', st_TRIAL: 'تجريبي', st_ACTIVE: 'نشط',
    st_PAST_DUE: 'متأخر', st_CANCELLED: 'ملغى', st_EXPIRED: 'منتهي',

    /* where each pane's settings show up */
    sfc_cafe: 'قائمة العملاء والفواتير', sfc_branch: 'هذا الفرع', sfc_receipt: 'الفاتورة المطبوعة', sfc_billing: 'الاشتراك',
    /* café pane */
    tentLabel: 'على الطاولة', tentCall: 'امسح لفتح القائمة',
    tentNote: 'هذا ما يمسحه عملاؤك. يتبع شعارك واسمك تلقائياً.',
    copyLink: 'نسخ الرابط', linkCopied: 'تم نسخ الرابط',
    menuOff: 'قائمتك موقوفة — الرابط لا يفتح للعملاء. تواصل مع Serva لإعادة تفعيلها.',
    /* branch pane */
    branchPaneSub: 'الاسم الذي يراه فريقك، والرابط الذي يفتحه عملاؤك، والطابعة التي يطبع منها هذا الفرع.',
    printTitle: 'الطباعة', printSub: 'تُطبع الفاتورة من الجهاز الذي أنهى الطلب.',
    printerShort: 'اطبع الفاتورة تلقائياً عند إنهاء الطلب.',
    cycMonthly: 'شهري', cycYearly: 'سنوي',
    tapeLabel: 'حالة الطابعة', tapeOn: 'مُفعّلة', tapeOff: 'متوقّفة',
    tapePrinter: 'الطابعة', tapeLast: 'آخر إرسال', tapeBuild: 'الإصدار', tapeNone: 'لا يوجد',
    tapeIdle: 'لا طباعة من هذا الجهاز',
    branchOnly: 'ليس لديك صلاحية تعديل الفرع.',
    /* receipt pane */
    rcptStyleSub: 'ستة أشكال جاهزة — اختر واحداً وشاهد الفاتورة تتغيّر فوراً.',
    rcptContentTitle: 'ما يُطبع', rcptContentSub: 'الشعار، الهاتف، أرقامك النظامية، ورسالتك في الأسفل.',
    /* plan pane */
    planTitle: 'الباقة', planSub: 'ما تصل إليه اليوم، ومتى يتجدّد اشتراكك.',
    inclTitle: 'ما تشمله باقتك', inclSub: 'الميزات المرتبطة باشتراكك — تُفتح فور الترقية.',
    incl_loyalty: 'بطاقة الأختام', incl_loyaltySub: 'ختم مع كل طلب ومكافأة عند اكتمال البطاقة.',
    incl_analytics: 'التحليلات', incl_analyticsSub: 'المبيعات، الأصناف الأكثر طلباً، وأوقات الذروة.',
    incl_look: 'استوديو الشكل المتقدّم', incl_lookSub: 'تشكيلات البطاقات والزخارف والثيم بصيغة JSON. يُمنح لكل مقهى.',
    inclOn: 'متاحة', inclOff: 'غير متاحة', inclGranted: 'ممنوحة', inclStd: 'عادي',
    noSub: 'لا يوجد اشتراك مسجّل', noSubHint: 'تواصل مع Serva لتفعيل اشتراك لهذا المقهى.',
  },
  en: {
    title: 'Restaurant profile', sub: 'Details shown on the customer menu and receipts.',
    detailsTitle: 'Restaurant details', detailsSub: 'Customer-facing identity and contact information.',
    operationsTitle: 'Orders and tax', operationsSub: 'Operational settings that affect collection and receipts.',
    branchTitle: 'Branch and menu link', branchSub: 'Manage the current branch name and its public menu address.',
    vatHelp: 'Show VAT on customer orders and receipts.',
    menuLinkHelp: 'This is the public address your customers open.',
    name: 'Restaurant name', phone: 'Phone', email: 'Email', instagram: 'Instagram',
    currency: 'Currency', vatEnabled: 'Enable VAT', vatRate: 'VAT rate', logo: 'Restaurant logo',
    paymentSelection: 'Choose payment method at collection', paymentSelectionSub: 'When enabled, staff choose Cash or Card before completing an order. When off, Card is recorded by default.',
    uploadLogo: 'Upload logo', removeLogo: 'Remove logo', logoRemoved: 'Logo removed', uploading: 'Uploading...', save: 'Save profile', saved: 'Saved', openMenu: 'Open menu',
    slug: 'Menu link', active: 'Active',
    subscription: 'Subscription', plan: 'Plan', sstatus: 'Status', renews: 'Renews', ended: 'Ended',
    oneTime: 'One-time access', access: 'Access', lifetime: 'Lifetime',
    branchName: 'Branch name', saveBranch: 'Save', branchSaved: 'Branch saved',
    printerEnabled: 'Auto-print receipts', printerEnabledSub: 'When on, the receipt prints from whichever device completed the order. Install the RawBT app on every staff device and pair each with the same printer.',
    testPrint: 'Test print', testPrintSent: 'Test print sent',
    lastSent: 'Last sent to printer', buildLabel: 'App build',
    receiptTitle: 'Receipt customization', receiptSub: 'Add your touch to the printed receipt — style, logo, and your own message.',
    rcptStyle: 'Receipt style', rcptClassic: 'Classic', rcptMinimal: 'Minimal', rcptBold: 'Bold',
    rcptRetro: 'Retro', rcptFancy: 'Fancy', rcptTicket: 'Ticket',
    rcptShowLogo: 'Show logo at the top', rcptNoLogo: 'Upload a logo first (top of this page).',
    rcptShowPhone: 'Show phone number', rcptNoPhone: 'Add a phone number first (restaurant details).',
    rcptFooter: 'Footer message', rcptFooterPh: 'e.g. Follow us @cafe · WiFi: guest123',
    rcptVatNo: 'VAT number', rcptCrNo: 'CR number',
    rcptSave: 'Save receipt', rcptSaved: 'Receipt settings saved', rcptPreview: 'Live preview',
    st_PENDING_PAYMENT: 'Awaiting payment', st_TRIAL: 'Trial', st_ACTIVE: 'Active',
    st_PAST_DUE: 'Past due', st_CANCELLED: 'Cancelled', st_EXPIRED: 'Expired',

    /* where each pane's settings show up */
    sfc_cafe: 'Customer menu · Receipts', sfc_branch: 'This branch', sfc_receipt: 'Printed receipt', sfc_billing: 'Subscription',
    /* café pane */
    tentLabel: 'On the table', tentCall: 'Scan for the menu',
    tentNote: 'This is what your customers scan. It follows your logo and name.',
    copyLink: 'Copy link', linkCopied: 'Link copied',
    menuOff: 'Your menu is switched off — this link will not open for customers. Talk to Serva to switch it back on.',
    /* branch pane */
    branchPaneSub: 'The name your staff see, the link your customers open, and the printer this branch prints from.',
    printTitle: 'Printing', printSub: 'Receipts print from whichever device completed the order.',
    printerShort: 'Print the receipt automatically when an order is completed.',
    cycMonthly: 'Monthly', cycYearly: 'Yearly',
    tapeLabel: 'Printer status', tapeOn: 'On', tapeOff: 'Off',
    tapePrinter: 'Printer', tapeLast: 'Last sent', tapeBuild: 'Build', tapeNone: 'None yet',
    tapeIdle: 'Nothing prints from this device',
    branchOnly: 'You do not have permission to edit this branch.',
    /* receipt pane */
    rcptStyleSub: 'Six ready-made looks — pick one and watch the sheet change.',
    rcptContentTitle: 'What prints', rcptContentSub: 'Logo, phone, your registration numbers and a closing message.',
    /* plan pane */
    planTitle: 'Plan', planSub: 'What you can reach today, and when the subscription renews.',
    inclTitle: "What's included", inclSub: 'Features tied to your subscription — they unlock the moment you upgrade.',
    incl_loyalty: 'Stamp card', incl_loyaltySub: 'A stamp on every order and a reward when the card is full.',
    incl_analytics: 'Analytics', incl_analyticsSub: 'Sales, best sellers and the hours you are busiest.',
    incl_look: 'Pro look studio', incl_lookSub: 'Card kits, decor and theme JSON. Granted per café.',
    inclOn: 'Included', inclOff: 'Not in this plan', inclGranted: 'Granted', inclStd: 'Standard',
    noSub: 'No subscription on file', noSubHint: 'Talk to Serva to put this café on a plan.',
  },
};

/** Synthetic order for the "Test print" button and the receipt live preview — exercises the
 *  whole capture→RawBT→printer chain without a real order. Never sent to the backend.
 *  Realistic sample lines so the preview reads like an actual receipt. */
function makeTestOrder(restaurantId: number, branchId: number): OrderResponse {
  return {
    id: 0, orderNumber: 'TEST', dailyNumber: 12, trackingToken: '', restaurantId, branchId,
    tableId: null, customerName: 'Print test', orderType: 'DINE_IN', status: 'COMPLETED',
    paymentStatus: 'PAID', paymentMethod: 'CASH', subtotal: 4.4, vatAmount: 0.22, total: 4.62,
    items: [
      { nameEn: 'Cappuccino', nameAr: 'كابتشينو', quantity: 2, price: 1.3, lineTotal: 2.6 },
      { nameEn: 'Cheesecake', nameAr: 'تشيز كيك', quantity: 1, price: 1.8, lineTotal: 1.8 },
    ],
    createdAt: new Date().toISOString(),
  };
}

/* ============================ 01+02 · CAFÉ ============================
 * Identity hero (logo, name, active badge) + contact details + VAT/payment
 * operations. These two used to be sections 01/02 of the old profile page —
 * they share one form and one Save button, so they stay paired as the
 * "Café" settings pane. */
export function CafeSection({ branchId }: { branchId?: number }) {
  const { user } = useAuth();
  const rid = user!.restaurantId!;
  const t = useT(DICT);
  const toast = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    logoUrl: '',
    phone: '',
    email: '',
    instagramUrl: '',
    currency: 'OMR',
    vatEnabled: true,
    vatRate: '5',
    paymentMethodSelectionEnabled: false,
  });

  const restaurantQ = useQuery({
    queryKey: ['restaurant', rid],
    queryFn: () => api.get<Restaurant>(`/api/restaurants/${rid}`),
  });

  useEffect(() => {
    const r = restaurantQ.data;
    if (!r) return;
    setForm({
      name: r.name ?? '',
      logoUrl: r.logoUrl ?? '',
      phone: r.phone ?? '',
      email: r.email ?? '',
      instagramUrl: r.instagramUrl ?? '',
      currency: r.currency ?? 'OMR',
      vatEnabled: r.vatEnabled,
      vatRate: String(r.vatRate ?? 5),
      paymentMethodSelectionEnabled: r.paymentMethodSelectionEnabled ?? false,
    });
  }, [restaurantQ.data?.id]);

  const save = useMutation({
    mutationFn: () => api.patch<Restaurant>(`/api/restaurants/${rid}`, {
      name: form.name.trim(),
      // Empty string clears the logo server-side; omit only when we intentionally leave it alone.
      logoUrl: form.logoUrl.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      instagramUrl: form.instagramUrl.trim() || null,
      currency: form.currency.trim().toUpperCase() || 'OMR',
      vatEnabled: form.vatEnabled,
      vatRate: Number(form.vatRate) || 0,
      paymentMethodSelectionEnabled: form.paymentMethodSelectionEnabled,
    }),
    onSuccess: (r) => {
      qc.setQueryData(['restaurant', rid], r);
      toast(t('saved'));
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  const removeLogo = useMutation({
    // PATCH: blank logoUrl clears; other fields omitted = unchanged.
    mutationFn: () => api.patch<Restaurant>(`/api/restaurants/${rid}`, { logoUrl: '' }),
    onSuccess: (r) => {
      qc.setQueryData(['restaurant', rid], r);
      setForm((p) => ({ ...p, logoUrl: '' }));
      toast(t('logoRemoved'));
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  async function onLogoFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await upload('/api/uploads/restaurants/logo', file);
      // Persist immediately so the logo sticks without a second "Save profile" click.
      const r = await api.patch<Restaurant>(`/api/restaurants/${rid}`, { logoUrl: url });
      qc.setQueryData(['restaurant', rid], r);
      setForm((p) => ({ ...p, logoUrl: r.logoUrl ?? url }));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const set = (key: keyof typeof form, value: string | boolean) => setForm((p) => ({ ...p, [key]: value }));
  const publicUrl = restaurantQ.data ? `/r/${restaurantQ.data.slug}${branchId != null ? `/b/${branchId}` : ''}` : null;
  const scanUrl = publicUrl ? window.location.origin + publicUrl : null;

  return (
    <SettingsShell
      bareMark
      mark={
        <>
          <button className="profile-logo" type="button" aria-label={t('uploadLogo')}
            onClick={() => fileRef.current?.click()}
            style={form.logoUrl ? { backgroundImage: `url('${form.logoUrl}')` } : undefined}>
            {!form.logoUrl && <span>{form.name.charAt(0) || 'S'}</span>}
            <i>{t('uploadLogo')}</i>
            {uploading && <em>{t('uploading')}</em>}
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onLogoFile} />
        </>
      }
      surface={t('sfc_cafe')}
      title={form.name || t('title')}
      sub={t('sub')}
      actions={
        <>
          <button className="btn sm ghost" type="button" onClick={() => fileRef.current?.click()} disabled={uploading || removeLogo.isPending}>{t('uploadLogo')}</button>
          {form.logoUrl && (
            <button className="btn sm danger" type="button"
              disabled={uploading || removeLogo.isPending}
              onClick={() => removeLogo.mutate()}>{t('removeLogo')}</button>
          )}
          <button className="btn sm" type="button" disabled={!form.name.trim() || save.isPending || uploading || removeLogo.isPending}
            onClick={() => save.mutate()}>{t('save')}</button>
        </>
      }
      aside={
        <Specimen label={t('tentLabel')}>
          <div className="stg-tent">
            <span className="stg-tent-logo"
              style={form.logoUrl ? { backgroundImage: `url('${form.logoUrl}')` } : undefined}>
              {!form.logoUrl && (form.name.charAt(0) || 'S')}
            </span>
            <span className="stg-tent-name">{form.name || t('title')}</span>
            {scanUrl && <MiniQr value={scanUrl} />}
            <span className="stg-tent-call">{t('tentCall')}</span>
            <span className="stg-tent-url">{publicUrl ?? '—'}</span>
          </div>
          <div className="stg-spec-actions">
            <button className="btn sm ghost" type="button" disabled={!publicUrl}
              onClick={() => publicUrl && window.open(publicUrl, '_blank', 'noopener,noreferrer')}>↗ {t('openMenu')}</button>
            <button className="btn sm ghost" type="button" disabled={!scanUrl}
              onClick={() => { if (scanUrl) { navigator.clipboard?.writeText(scanUrl); toast(t('linkCopied')); } }}>{t('copyLink')}</button>
          </div>
          <p className="stg-spec-note">
            {restaurantQ.data && !restaurantQ.data.active ? <b>{t('menuOff')}</b> : t('tentNote')}
          </p>
        </Specimen>
      }
    >
      <PaneSection no="01" title={t('detailsTitle')} sub={t('detailsSub')}>
        <div className="profile-fields">
          <label className="field"><span>{t('name')}</span><input value={form.name} onChange={(e) => set('name', e.target.value)} /></label>
          <label className="field"><span>{t('phone')}</span><input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></label>
          <label className="field"><span>{t('email')}</span><input value={form.email} onChange={(e) => set('email', e.target.value)} /></label>
          <label className="field"><span>{t('instagram')}</span><input value={form.instagramUrl} onChange={(e) => set('instagramUrl', e.target.value)} /></label>
          <label className="field profile-currency"><span>{t('currency')}</span><input value={form.currency} maxLength={3} onChange={(e) => set('currency', e.target.value.toUpperCase())} /></label>
        </div>
      </PaneSection>

      <PaneSection no="02" title={t('operationsTitle')} sub={t('operationsSub')}>
        <div className="profile-settings">
          <div className="profile-setting">
            <div><b>{t('vatEnabled')}</b><span>{t('vatHelp')}</span></div>
            <button type="button" className={'switch' + (form.vatEnabled ? ' on' : '')}
              role="switch" aria-checked={form.vatEnabled} aria-label={t('vatEnabled')}
              onClick={() => set('vatEnabled', !form.vatEnabled)}><span /></button>
          </div>
          <label className={'field profile-vat-rate' + (!form.vatEnabled ? ' disabled' : '')}>
            <span>{t('vatRate')}</span>
            <div className="profile-number-input"><input className="num" type="number" min="0" max="100" step="0.1"
              disabled={!form.vatEnabled} value={form.vatRate} onChange={(e) => set('vatRate', e.target.value)} /><i>%</i></div>
          </label>
          <div className="profile-setting profile-payment-setting">
            <div><b>{t('paymentSelection')}</b><span>{t('paymentSelectionSub')}</span></div>
            <button type="button" className={'switch' + (form.paymentMethodSelectionEnabled ? ' on' : '')}
              role="switch" aria-checked={form.paymentMethodSelectionEnabled} aria-label={t('paymentSelection')}
              onClick={() => set('paymentMethodSelectionEnabled', !form.paymentMethodSelectionEnabled)}><span /></button>
          </div>
        </div>
      </PaneSection>
    </SettingsShell>
  );
}

/* ============================ 03 · BRANCH & PRINTER ============================ */
export function BranchPrinterSection({ branchId }: { branchId?: number }) {
  const { user } = useAuth();
  const rid = user!.restaurantId!;
  const t = useT(DICT);
  const toast = useToast();
  const qc = useQueryClient();
  const printReceipt = useReceiptPrinter();
  const [branchName, setBranchName] = useState('');

  const restaurantQ = useQuery({
    queryKey: ['restaurant', rid],
    queryFn: () => api.get<Restaurant>(`/api/restaurants/${rid}`),
  });

  // Shares the cache key the dashboard shell uses, so a rename reflects everywhere.
  const branchesQ = useQuery({
    queryKey: ['branches', rid],
    queryFn: () => api.get<BranchResponse[]>(`/api/restaurants/${rid}/branches`),
  });
  const branch = branchesQ.data?.find((b) => b.id === branchId) ?? branchesQ.data?.[0];
  useEffect(() => { if (branch) setBranchName(branch.name); }, [branch?.id]); // eslint-disable-line

  // Last handoff time (device-local) — refreshed while this page is open so a "Test print"
  // tap visibly registers moments later, useful on tablets with no devtools.
  const printingOn = !!branch?.printerEnabled;
  const [lastAttempt, setLastAttempt] = useState<PrintAttempt | null>(null);
  useEffect(() => {
    if (!printingOn) { setLastAttempt(null); return; }
    setLastAttempt(getLastPrintAttempt());
    const interval = window.setInterval(() => setLastAttempt(getLastPrintAttempt()), 4_000);
    return () => window.clearInterval(interval);
  }, [printingOn]);

  const branchSave = useMutation({
    mutationFn: (body: { name?: string; printerEnabled?: boolean }) =>
      api.patch<BranchResponse>(`/api/branches/${branch!.id}`, body),
    onSuccess: (b) => {
      qc.setQueryData<BranchResponse[]>(['branches', rid], (prev = []) => prev.map((x) => (x.id === b.id ? b : x)));
      toast(t('branchSaved'));
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  const canEditBranch = !!branch && can(user, 'BRANCHES');

  return (
    <SettingsShell
      mark="🖨"
      surface={t('sfc_branch')}
      title={branch?.name || t('branchTitle')}
      sub={t('branchPaneSub')}
      actions={
        <button className="btn sm ghost" type="button" disabled={!restaurantQ.data}
          onClick={() => restaurantQ.data && window.open(
            `/r/${restaurantQ.data.slug}${branchId != null ? `/b/${branchId}` : ''}`, '_blank', 'noopener,noreferrer')}>
          ↗ {t('openMenu')}
        </button>
      }
      aside={
        <Specimen label={t('tapeLabel')}>
          {/* A strip of the tape this branch's printer would spit out — the fastest
              way to tell a floor tablet is actually wired to a printer. */}
          <div className="stg-tape-wrap">
            <div className="stg-tape">
              <div className="stg-tape-brand">Serva</div>
              <div className="stg-tape-name">{branch?.name || '—'}</div>
              <hr />
              <div className="stg-tape-row"><span>{t('tapePrinter')}</span><span>{printingOn ? t('tapeOn') : t('tapeOff')}</span></div>
              <div className="stg-tape-row"><span>{t('tapeLast')}</span>
                <span>{lastAttempt ? new Date(lastAttempt.at).toLocaleTimeString() : t('tapeNone')}</span></div>
              <div className="stg-tape-row"><span>{t('tapeBuild')}</span><span>{__BUILD_TIME__}</span></div>
              {!printingOn && <div className="stg-tape-idle">{t('tapeIdle')}</div>}
            </div>
          </div>
          {printingOn && canEditBranch && (
            <div className="stg-spec-actions">
              <button className="btn sm ghost" type="button"
                onClick={() => { printReceipt(makeTestOrder(rid, branch!.id)); toast(t('testPrintSent')); }}>
                🖨 {t('testPrint')}
              </button>
            </div>
          )}
          <p className="stg-spec-note">{t('printerEnabledSub')}</p>
        </Specimen>
      }
    >
      <PaneSection no="01" title={t('branchTitle')} sub={t('branchSub')}>
        <div className="profile-fields">
          {canEditBranch && (
            <label className="field"><span>{t('branchName')}</span>
              <div className="branch-row">
                <input value={branchName} onChange={(e) => setBranchName(e.target.value)} />
                <button className="btn sm ghost" type="button"
                  disabled={!branchName.trim() || branchName.trim() === branch!.name || branchSave.isPending}
                  onClick={() => branchSave.mutate({ name: branchName.trim() })}>{t('saveBranch')}</button>
              </div>
            </label>
          )}
          <label className="field"><span>{t('slug')}</span><input className="num" value={restaurantQ.data?.slug ?? ''} disabled /></label>
        </div>
        <small className="loy-hint">{t('menuLinkHelp')}</small>
      </PaneSection>

      {canEditBranch && (
        <PaneSection no="02" title={t('printTitle')} sub={t('printSub')}>
          <div className="profile-settings">
            <div className="profile-setting profile-printer-setting">
              <div>
                <b>{t('printerEnabled')}</b><span>{t('printerShort')}</span>
                {printingOn && lastAttempt && (
                  <span className="print-server-status ok">
                    {'✓ ' + t('lastSent') + ' · ' + new Date(lastAttempt.at).toLocaleTimeString()}
                  </span>
                )}
              </div>
              <div className="printer-station-actions">
                <button type="button" className={'switch' + (branch!.printerEnabled ? ' on' : '')}
                  role="switch" aria-checked={branch!.printerEnabled} aria-label={t('printerEnabled')}
                  disabled={branchSave.isPending}
                  onClick={() => branchSave.mutate({ printerEnabled: !branch!.printerEnabled })}><span /></button>
              </div>
            </div>
          </div>
        </PaneSection>
      )}
    </SettingsShell>
  );
}

/* ============================ 04 · RECEIPT ============================ */
export function ReceiptSection({ branchId }: { branchId?: number }) {
  const { user } = useAuth();
  const rid = user!.restaurantId!;
  const t = useT(DICT);
  const toast = useToast();
  const qc = useQueryClient();

  const restaurantQ = useQuery({
    queryKey: ['restaurant', rid],
    queryFn: () => api.get<Restaurant>(`/api/restaurants/${rid}`),
  });

  // Receipt customization draft — hydrated from the saved JSON, edited locally with a live
  // preview, saved via its own PATCH (mirrors the menu-theme flow in MenuManager).
  const [rcpt, setRcpt] = useState<ReceiptSettings>({ ...RECEIPT_DEFAULTS });
  useEffect(() => {
    if (restaurantQ.data) setRcpt(parseReceiptSettings(restaurantQ.data.receiptSettingsJson));
  }, [restaurantQ.data?.id]); // eslint-disable-line
  const setRcptField = <K extends keyof ReceiptSettings>(k: K, v: ReceiptSettings[K]) =>
    setRcpt((p) => ({ ...p, [k]: v }));
  const rcptSave = useMutation({
    mutationFn: () => api.patch<Restaurant>(`/api/restaurants/${rid}/receipt`,
      { receiptSettingsJson: JSON.stringify(rcpt) }),
    onSuccess: (r) => {
      qc.setQueryData(['restaurant', rid], r);
      toast(t('rcptSaved'));
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  const hasLogo = !!restaurantQ.data?.logoUrl;
  const hasPhone = !!restaurantQ.data?.phone;

  return (
    <SettingsShell
      mark="🧾"
      surface={t('sfc_receipt')}
      title={t('receiptTitle')}
      sub={t('receiptSub')}
      asideWidth="paper"
      actions={
        <button className="btn sm" type="button" disabled={rcptSave.isPending}
          onClick={() => rcptSave.mutate()}>{t('rcptSave')}</button>
      }
      aside={
        <Specimen label={t('rcptPreview')}>
          <div className="receipt-preview-sheet">
            <ReceiptSheet order={makeTestOrder(rid, branchId ?? 0)} restaurant={restaurantQ.data}
              tableNumber="5" settingsOverride={rcpt} />
          </div>
        </Specimen>
      }
    >
      <PaneSection no="01" title={t('rcptStyle')} sub={t('rcptStyleSub')}>
        <div className="seg seg-wrap">
          {(['classic', 'minimal', 'bold', 'retro', 'fancy', 'ticket'] as ReceiptStyle[]).map((st) => (
            <button key={st} type="button" className={rcpt.style === st ? 'on' : ''}
              onClick={() => setRcptField('style', st)}>
              {t('rcpt' + st.charAt(0).toUpperCase() + st.slice(1))}
            </button>
          ))}
        </div>
      </PaneSection>

      <PaneSection no="02" title={t('rcptContentTitle')} sub={t('rcptContentSub')}>
        <div className="profile-settings">
          {/* Both rows carry long labels, so they take the full width instead of
              sharing the grid's narrow control column. */}
          <div className="profile-setting stg-span2">
            <div><b>{t('rcptShowLogo')}</b>{!hasLogo && <span>{t('rcptNoLogo')}</span>}</div>
            <button type="button" className={'switch' + (rcpt.showLogo ? ' on' : '')}
              role="switch" aria-checked={rcpt.showLogo} aria-label={t('rcptShowLogo')}
              disabled={!hasLogo}
              onClick={() => setRcptField('showLogo', !rcpt.showLogo)}><span /></button>
          </div>
          <div className="profile-setting stg-span2">
            <div><b>{t('rcptShowPhone')}</b>{!hasPhone && <span>{t('rcptNoPhone')}</span>}</div>
            <button type="button" className={'switch' + (rcpt.showPhone ? ' on' : '')}
              role="switch" aria-checked={rcpt.showPhone} aria-label={t('rcptShowPhone')}
              disabled={!hasPhone}
              onClick={() => setRcptField('showPhone', !rcpt.showPhone)}><span /></button>
          </div>
        </div>
        <div className="profile-fields" style={{ marginTop: 13 }}>
          <label className="field stg-span2"><span>{t('rcptFooter')}</span>
            <textarea rows={2} maxLength={200} value={rcpt.footerText} placeholder={t('rcptFooterPh')}
              onChange={(e) => setRcptField('footerText', e.target.value)} />
          </label>
          <label className="field"><span>{t('rcptVatNo')}</span>
            <input className="num" maxLength={30} value={rcpt.vatNumber}
              onChange={(e) => setRcptField('vatNumber', e.target.value)} />
          </label>
          <label className="field"><span>{t('rcptCrNo')}</span>
            <input className="num" maxLength={30} value={rcpt.crNumber}
              onChange={(e) => setRcptField('crNumber', e.target.value)} />
          </label>
        </div>
      </PaneSection>
    </SettingsShell>
  );
}

/* ============================ ASIDE · PLAN ============================ */
export function PlanSection() {
  const { user } = useAuth();
  const rid = user!.restaurantId!;
  const { lang } = useI18n();
  const t = useT(DICT);

  // Subscription is owner-visible; admin-created cafés may have none → don't retry a 404.
  const subscriptionQ = useQuery({
    queryKey: ['subscription', rid],
    queryFn: () => api.get<Subscription>(`/api/restaurants/${rid}/subscription`),
    retry: false,
  });
  const restaurantQ = useQuery({
    queryKey: ['restaurant', rid],
    queryFn: () => api.get<Restaurant>(`/api/restaurants/${rid}`),
  });
  const sub = subscriptionQ.data;

  const fmtDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString(lang === 'ar' ? 'ar' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  const isOneTime = sub?.billingCycle === 'ONE_TIME';
  const planLabel = isOneTime ? t('oneTime') : (sub?.planName || restaurantQ.data?.plan || t('planTitle'));

  // Reads straight off the gates the rest of the dashboard enforces, so this list
  // can never promise something the app then refuses to open.
  const pro = isProPlan(restaurantQ.data?.plan);
  const premiumLook = !!restaurantQ.data?.premiumLook;
  const included = [
    { key: 'loyalty', on: pro, label: t('incl_loyalty'), sub: t('incl_loyaltySub'), state: pro ? t('inclOn') : t('inclOff') },
    { key: 'analytics', on: pro, label: t('incl_analytics'), sub: t('incl_analyticsSub'), state: pro ? t('inclOn') : t('inclOff') },
    { key: 'look', on: premiumLook, label: t('incl_look'), sub: t('incl_lookSub'), state: premiumLook ? t('inclGranted') : t('inclStd') },
  ];

  return (
    <SettingsShell
      mark={planLabel.charAt(0).toUpperCase()}
      markClass="seal"
      surface={t('sfc_billing')}
      title={planLabel}
      sub={t('planSub')}
      aside={sub ? (
        <section className="profile-plan-card">
          {/* The hero already carries the tier — this card answers what the hero
              cannot: how it is billed, whether it is live, and until when. */}
          <span className="profile-side-label">{t('subscription')}</span>
          <div className="profile-plan-name">
            {isOneTime ? t('oneTime') : sub.billingCycle === 'YEARLY' ? t('cycYearly') : t('cycMonthly')}
          </div>
          <b className={'sub-pill st-' + sub.status}>{t('st_' + sub.status)}</b>
          <dl>
            <div><dt>{isOneTime ? t('access') : sub.status === 'EXPIRED' ? t('ended') : t('renews')}</dt><dd>{isOneTime ? t('lifetime') : fmtDate(sub.endDate)}</dd></div>
          </dl>
        </section>
      ) : (
        <Specimen label={t('subscription')}>
          <p className="stg-spec-note"><b>{t('noSub')}</b><br />{t('noSubHint')}</p>
        </Specimen>
      )}
    >
      <PaneSection no="01" title={t('inclTitle')} sub={t('inclSub')}>
        <div className="stg-incl">
          {included.map((f) => (
            <div key={f.key} className={'stg-incl-row' + (f.on ? ' on' : '')}>
              <span className="mk" aria-hidden="true">{f.on ? '✓' : '·'}</span>
              <div><b>{f.label}</b><span>{f.sub}</span></div>
              <span className="st">{f.state}</span>
            </div>
          ))}
        </div>
      </PaneSection>
    </SettingsShell>
  );
}
