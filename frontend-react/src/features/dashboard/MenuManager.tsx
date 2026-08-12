import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, upload, ApiError } from '../../lib/api';
import { useAuth, canUsePremiumThemes } from '../../lib/auth';
import { useI18n, useT, pick, type Dict } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import { useConfirm } from '../../lib/confirm';
import { omr, estimateVat, discountPercent } from '../../lib/format';
import type { CategoryResponse, MenuItemResponse, Restaurant } from '../../lib/types';
import RecipeEditor from './RecipeEditor';
import { ensureGoogleFonts } from '../../lib/fonts';
import { MenuDecorLayer } from '../customer/MenuDecor';
import {
  ALL_MENU_FONT_SPECS,
  CARD_BADGE_OPTIONS,
  CARD_STYLE_OPTIONS,
  CUSTOM_THEME,
  DEFAULT_CUSTOM_THEME,
  FONT_OPTIONS,
  FONT_STACKS,
  HEADER_STYLE_OPTIONS,
  MOTIF_OPTIONS,
  RADIUS_OPTIONS,
  THEME_PRESETS,
  customThemeVars,
  menuStructuralAttrs,
  parseCustomTheme,
  serializeCustomTheme,
  type MenuThemeCustom,
  type MenuThemePreset,
} from '../customer/menuThemes';
import '../customer/customer.css';
import '../customer/menu-themes.css';
import './look-studio.css';

const DICT: Dict = {
  ar: { addCat: '＋ قسم', addItem: '＋ صنف', editCat: 'تعديل القسم', newCat: 'قسم جديد', editItem: 'تعديل الصنف', newItem: 'صنف جديد',
        nameAr: 'الاسم (عربي)', nameEn: 'الاسم (إنجليزي)', descAr: 'الوصف (عربي)', descEn: 'الوصف (إنجليزي)',
        price: 'السعر', prep: 'دقائق التحضير', category: 'القسم', available: 'متوفر الآن', image: 'الصورة', uploadImg: 'رفع صورة', uploading: 'جارٍ الرفع…', removeImg: 'حذف الصورة',
        addPhoto: 'إضافة صورة', cover: 'الغلاف', photosHint: 'الصورة الأولى هي الغلاف',
        options: 'الخيارات', optionsHint: 'مثل: الحجم (كبير/صغير) أو نوع الحليب', addGroup: '＋ مجموعة خيارات', groupNameAr: 'اسم المجموعة (ع)', groupNameEn: 'اسم المجموعة (EN)',
        single: 'اختيار واحد', multi: 'متعدد', requiredOpt: 'إلزامي', addOption: '＋ خيار', optNameAr: 'الخيار (ع)', optNameEn: 'الخيار (EN)', priceDelta: 'فرق السعر', stockRecipe: 'المخزون والوصفة',
        save: 'حفظ', cancel: 'إلغاء', del: 'حذف', cur: 'ر.ع', noItems: 'لا أصناف بعد',
        discount: 'الخصم', discNone: 'بدون', discPercent: 'نسبة %', discFixed: 'سعر العرض',
        discPercentVal: 'نسبة الخصم %', discNewPrice: 'السعر بعد الخصم', discStarts: 'يبدأ (اختياري)', discEnds: 'ينتهي (اختياري)',
        discResult: 'السعر الآن', discScheduled: 'مجدول', discEnded: 'منتهٍ', saleBadge: 'عرض',
        delCat: 'لا يمكن حذف قسم فيه أصناف. احذف الأصناف أولاً.', delItem: 'سيختفي الصنف من قائمة العملاء. الطلبات القديمة تبقى محفوظة.',
        deleteCatTitle: 'حذف القسم', deleteItemTitle: 'حذف الصنف', deleteConfirm: 'حذف الآن', deleting: 'جارٍ الحذف…',
        categoryHasItems: 'هذا القسم فيه أصناف. احذف الأصناف أولاً ثم ارجع لحذف القسم.',
        empty: 'لا توجد أقسام — ابدأ بإضافة قسم', items: 'أصناف',
        lookTitle: 'شكل قائمة العملاء', lookSub: 'صمّم شاشة الطلب كهوية صغيرة للمقهى: ألوان واضحة، رسمة خفيفة، وسلة بارزة.',
        custom: 'لوحة التحكم', presets: 'الثيمات الجاهزة', preview: 'فتح المعاينة', saveLook: 'حفظ الشكل', saved: 'تم الحفظ', shuffle: 'خلط سريع', resetLook: 'رجوع للأصل',
        studioKicker: 'استوديو القائمة', motifStudio: 'تصميم القائمة', colorStudio: 'الألوان المهمة', phonePreview: 'المعاينة الحية',
        fineTune: 'ضبط دقيق', advanced: 'إعدادات متقدمة', grpTypography: 'الخط والحواف', grpCards: 'البطاقات والترويسة', grpMotif: 'الرسمة والملصقات',
        unsavedBadge: 'تغييرات غير محفوظة', resetConfirmTitle: 'إعادة الضبط الافتراضي؟', resetConfirmMsg: 'سيتم فقد كل التعديلات غير المحفوظة والرجوع للتصميم الافتراضي.',
        sampleCat: 'المشروبات', sampleCat2: 'الحلويات', sampleCat3: 'الفطور',
        sampleItem: 'لاتيه عماني', sampleItem2: 'كيكة تمر', sampleItem3: 'شاي كرك', sampleItem4: 'كرواسون زعتر', sampleItem5: 'قهوة باردة',
        sampleDesc: 'حليب، قهوة عربية، هيل', sampleDesc2: 'تمر، طحينة، رشة بحرية', sampleDesc3: 'شاي أسود، حليب، زعفران', samplePrice: '٢.٤٠', viewCart: 'عرض السلة',
        canvas: 'الخلفية الخارجية', paper: 'سطح الهاتف', surface: 'البطاقات', text: 'النص', muted: 'النص الثانوي', accent: 'اللون الأساسي', accent2: 'لون مساعد',
        motifColor: 'لون الرسمة', cartBg: 'شريط السلة',
        motif: 'الرسمة الخفيفة', motifOpacity: 'وضوح الرسمة', mt_none: 'بدون', mt_bean: 'بن', mt_cup: 'كوب', mt_palm: 'نخلة', mt_star: 'نجمة',
        mt_crescent: 'هلال', mt_leaf: 'ورقة', mt_drop: 'قطرة', mt_geo: 'هندسي',
        fontLbl: 'الخط', cornersLbl: 'الحواف', r_sharp: 'حادة', r_soft: 'ناعمة', r_round: 'دائرية',
        ft_system: 'الافتراضي', ft_markazi: 'مركزي', ft_baloo: 'بالو', ft_tajawal: 'تجوال', ft_elmessiri: 'المسيري', ft_reemkufi: 'ريم كوفي', ft_sora: 'سورا',
        cardStyleLbl: 'شكل البطاقة', cs_flat: 'مسطّحة', cs_outline: 'مُحدّدة', cs_ticket: 'تذكرة', cs_comic: 'كوميك', cs_glow: 'توهّج',
        cardBadgeLbl: 'شارة الزاوية', cb_none: 'بدون', cb_disc: 'قرص', cb_tab: 'لسان', cb_ribbon: 'شريط',
        headerStyleLbl: 'ترويسة القسم', hs_plain: 'بسيطة', hs_band: 'شريط', hs_side: 'جانبي',
        jsonTitle: 'كود الثيم (JSON)', jsonHint: 'الصق ثيماً جاهزاً (مثلاً من مولّد ذكاء اصطناعي) ثم اضغط تحميل، أو انسخ الحالي لتعديله لاحقاً.',
        jsonLoad: 'تحميل', jsonCopy: 'نسخ', jsonCopied: 'تم النسخ ✓', jsonBad: 'JSON غير صالح', jsonPlace: 'الصق JSON هنا…',
        cartTitle: 'سلّتك', subtotal: 'المجموع الفرعي', vatLbl: 'الضريبة', totalLbl: 'الإجمالي', place: 'إرسال الطلب', tableLbl: 'طاولة',
        stickersLbl: 'الملصقات والتهنئة', stickerFree: 'ملصقات مخصصة (إيموجي)', cardStickerLbl: 'ملصق على الأصناف',
        stickerOpacity: 'وضوح الملصقات', bannerArLbl: 'شريط التهنئة (عربي)', bannerEnLbl: 'شريط التهنئة (إنجليزي)',
        sp_none: 'بدون', sp_coffee: 'قهوة', sp_roses: 'ورود', sp_footy: 'كورة', sp_oman: 'عُمان', sp_party: 'احتفال', sp_night: 'ليل',
        itemNote: 'ملاحظة على الصنف…', custName: 'الاسم (اختياري)', custPhone: 'الجوال (اختياري)',
        orderNote: 'ملاحظة على الطلب', orderNotePh: 'مثال: بدون سكر…', finalNote: 'يُحتسب الإجمالي النهائي من المقهى عند تأكيد الطلب.',
        trackTitle: 'تتبّع الطلب', orderNo: 'رقم الطلب', thanks: 'شكراً لك', backMenu: 'العودة للقائمة',
        head_PENDING: 'تم الإرسال — بانتظار المقهى', head_ACCEPTED: 'تم القبول', head_PREPARING: 'قيد التحضير', head_READY: 'جاهز للتقديم',
        st_PENDING: 'أرسلنا طلبك', st_ACCEPTED: 'قبِله المقهى', st_PREPARING: 'يُحضَّر الآن', st_READY: 'جاهز!' },
  en: { addCat: '＋ Category', addItem: '＋ Item', editCat: 'Edit category', newCat: 'New category', editItem: 'Edit item', newItem: 'New item',
        nameAr: 'Name (Arabic)', nameEn: 'Name (English)', descAr: 'Description (Arabic)', descEn: 'Description (English)',
        price: 'Price', prep: 'Prep minutes', category: 'Category', available: 'Available now', image: 'Photo', uploadImg: 'Upload photo', uploading: 'Uploading…', removeImg: 'Remove photo',
        addPhoto: 'Add photo', cover: 'Cover', photosHint: 'First photo is the cover',
        options: 'Options', optionsHint: 'e.g. Size (large/small) or milk type', addGroup: '＋ Option group', groupNameAr: 'Group name (AR)', groupNameEn: 'Group name (EN)',
        single: 'Pick one', multi: 'Multiple', requiredOpt: 'Required', addOption: '＋ Option', optNameAr: 'Option (AR)', optNameEn: 'Option (EN)', priceDelta: 'Price +/-', stockRecipe: 'Stock & recipe',
        save: 'Save', cancel: 'Cancel', del: 'Delete', cur: 'OMR', noItems: 'No items yet',
        discount: 'Discount', discNone: 'None', discPercent: '% off', discFixed: 'Sale price',
        discPercentVal: 'Percent off', discNewPrice: 'New price', discStarts: 'Starts (optional)', discEnds: 'Ends (optional)',
        discResult: 'Now', discScheduled: 'Scheduled', discEnded: 'Ended', saleBadge: 'Sale',
        delCat: 'A category with items cannot be deleted. Delete the items first.', delItem: 'This item will disappear from the customer menu. Old orders stay saved.',
        deleteCatTitle: 'Delete category', deleteItemTitle: 'Delete item', deleteConfirm: 'Delete now', deleting: 'Deleting…',
        categoryHasItems: 'This category still has items. Delete the items first, then come back to delete the category.',
        empty: 'No categories — add one to start', items: 'items',
        lookTitle: 'Customer menu look', lookSub: 'Design the ordering screen as a tiny brand system: readable colors, a light motif, and a strong cart bar.',
        custom: 'Control board', presets: 'Ready themes', preview: 'Open preview', saveLook: 'Save look', saved: 'Saved', shuffle: 'Quick mix', resetLook: 'Reset default',
        studioKicker: 'Menu studio', motifStudio: 'Menu design', colorStudio: 'Core colors', phonePreview: 'Live preview',
        fineTune: 'Fine-tune', advanced: 'Advanced', grpTypography: 'Typography & shape', grpCards: 'Cards & header', grpMotif: 'Motif & stickers',
        unsavedBadge: 'Unsaved changes', resetConfirmTitle: 'Reset to default?', resetConfirmMsg: 'This clears every unsaved change and restores the starting look.',
        sampleCat: 'Drinks', sampleCat2: 'Desserts', sampleCat3: 'Breakfast',
        sampleItem: 'Omani latte', sampleItem2: 'Date cake', sampleItem3: 'Karak tea', sampleItem4: 'Zaatar croissant', sampleItem5: 'Cold brew',
        sampleDesc: 'Milk, Arabic coffee, cardamom', sampleDesc2: 'Dates, tahini, sea salt', sampleDesc3: 'Black tea, milk, saffron', samplePrice: '2.40', viewCart: 'View cart',
        canvas: 'Outer background', paper: 'Phone surface', surface: 'Cards', text: 'Text', muted: 'Secondary text', accent: 'Primary', accent2: 'Secondary',
        motifColor: 'Motif color', cartBg: 'Cart bar',
        motif: 'Light motif', motifOpacity: 'Motif strength', mt_none: 'None', mt_bean: 'Beans', mt_cup: 'Cup', mt_palm: 'Palm', mt_star: 'Star',
        mt_crescent: 'Crescent', mt_leaf: 'Leaf', mt_drop: 'Drop', mt_geo: 'Geometric',
        fontLbl: 'Font', cornersLbl: 'Corners', r_sharp: 'Sharp', r_soft: 'Soft', r_round: 'Round',
        ft_system: 'Default', ft_markazi: 'Markazi', ft_baloo: 'Baloo', ft_tajawal: 'Tajawal', ft_elmessiri: 'El Messiri', ft_reemkufi: 'Reem Kufi', ft_sora: 'Sora',
        cardStyleLbl: 'Card style', cs_flat: 'Flat', cs_outline: 'Outline', cs_ticket: 'Ticket', cs_comic: 'Comic', cs_glow: 'Glow',
        cardBadgeLbl: 'Corner badge', cb_none: 'None', cb_disc: 'Disc', cb_tab: 'Tab', cb_ribbon: 'Ribbon',
        headerStyleLbl: 'Section header', hs_plain: 'Plain', hs_band: 'Band', hs_side: 'Side bar',
        jsonTitle: 'Theme code (JSON)', jsonHint: 'Paste a ready theme (e.g. from an AI generator) and hit Load, or copy the current one to tweak later.',
        jsonLoad: 'Load', jsonCopy: 'Copy', jsonCopied: 'Copied ✓', jsonBad: 'Invalid JSON', jsonPlace: 'Paste JSON here…',
        cartTitle: 'Your cart', subtotal: 'Subtotal', vatLbl: 'VAT', totalLbl: 'Total', place: 'Place order', tableLbl: 'Table',
        stickersLbl: 'Stickers & greeting', stickerFree: 'Custom stickers (emoji)', cardStickerLbl: 'Sticker on items',
        stickerOpacity: 'Sticker strength', bannerArLbl: 'Greeting ribbon (Arabic)', bannerEnLbl: 'Greeting ribbon (English)',
        sp_none: 'None', sp_coffee: 'Coffee', sp_roses: 'Roses', sp_footy: 'Footy', sp_oman: 'Oman', sp_party: 'Party', sp_night: 'Night',
        itemNote: 'Note for this item…', custName: 'Name (optional)', custPhone: 'Phone (optional)',
        orderNote: 'Order note', orderNotePh: 'e.g. no sugar…', finalNote: 'Final total is confirmed by the cafe when your order is accepted.',
        trackTitle: 'Track order', orderNo: 'Order', thanks: 'Thank you', backMenu: 'Back to menu',
        head_PENDING: 'Sent — waiting for the cafe', head_ACCEPTED: 'Accepted', head_PREPARING: 'Preparing', head_READY: 'Ready to serve',
        st_PENDING: 'Order sent', st_ACCEPTED: 'Cafe accepted', st_PREPARING: 'Being prepared', st_READY: 'Ready!' },
};

const thumb = (it: MenuItemResponse) => it.imageUrl
  ? { backgroundImage: `url('${it.imageUrl}')` }
  : { backgroundImage: `linear-gradient(155deg, hsl(${(it.id * 47) % 360} 42% 34%) -30%, #15171C 70%)` };

/** Discounted price + lifecycle for a menu item from its raw discount fields (client-side clock). */
type DiscountFields = { price: number; discountType?: string | null; discountValue?: number | null; discountStartsAt?: string | null; discountEndsAt?: string | null };
function discountState(it: DiscountFields): { sale: number; active: boolean; scheduled: boolean; ended: boolean } | null {
  if (!it.discountType || it.discountValue == null || it.discountValue <= 0) return null;
  const sale = it.discountType === 'PERCENT'
    ? Math.round((it.price * (100 - it.discountValue)) / 100 * 1000) / 1000
    : it.discountValue;
  if (sale <= 0 || sale >= it.price) return null;
  const now = Date.now();
  const starts = it.discountStartsAt ? Date.parse(it.discountStartsAt) : null;
  const ends = it.discountEndsAt ? Date.parse(it.discountEndsAt) : null;
  const scheduled = starts != null && now < starts;
  const ended = ends != null && now >= ends;
  return { sale, active: !scheduled && !ended, scheduled, ended };
}

/** ISO instant → `YYYY-MM-DDTHH:mm` in local time for a <input type="datetime-local">. */
const isoToLocalInput = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** Local datetime-local string → ISO instant (UTC), or null when empty/invalid. */
const localInputToIso = (local: string): string | null => {
  if (!local) return null;
  const d = new Date(local);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

type CustomColorKey = 'canvas' | 'paper' | 'surface' | 'text' | 'muted' | 'accent' | 'accent2' | 'motifColor' | 'cartBg';

const MENU_COLOR_FIELDS: { key: CustomColorKey; label: string }[] = [
  // 'canvas' (outer background) intentionally omitted: it's only visible around the phone, so on a
  // real device it does nothing. It still backs the background gradient and tracks paper on shuffle.
  { key: 'paper', label: 'paper' },
  { key: 'surface', label: 'surface' },
  { key: 'text', label: 'text' },
  { key: 'muted', label: 'muted' },
  { key: 'accent', label: 'accent' },
  { key: 'accent2', label: 'accent2' },
  { key: 'motifColor', label: 'motifColor' },
  { key: 'cartBg', label: 'cartBg' },
];
const MOTIF_MARKS: Record<MenuThemeCustom['motif'], string> = {
  none: '—', bean: '◖', cup: '☕', palm: '♧', star: '✦', crescent: '☾', leaf: '❧', drop: '❍', geo: '❖',
};
const CARD_STYLE_MARKS: Record<MenuThemeCustom['cardStyle'], string> = {
  flat: '▭', outline: '▢', ticket: '✂', comic: '✸', glow: '✦',
};
const CARD_BADGE_MARKS: Record<MenuThemeCustom['cardBadge'], string> = {
  none: '—', disc: '⬤', tab: '▬', ribbon: '◤',
};
const HEADER_STYLE_MARKS: Record<MenuThemeCustom['headerStyle'], string> = {
  plain: '—', band: '▰', side: '▏',
};

// Only one ready theme is offered (Oman National Day). Set false to hide the row.
const SHOW_READY_THEMES = true;

// One-tap sticker sets; "custom stickers" input below them accepts any emoji.
const STICKER_PACKS: { key: string; floaters: string[]; cardSticker: string }[] = [
  { key: 'none', floaters: [], cardSticker: '' },
  { key: 'coffee', floaters: ['☕', '🫘', '🥐'], cardSticker: '☕' },
  { key: 'roses', floaters: ['🌹', '💐', '🌷', '🤍'], cardSticker: '🌹' },
  { key: 'footy', floaters: ['⚽', '🏆', '🇴🇲'], cardSticker: '⚽' },
  { key: 'oman', floaters: ['🇴🇲', '❤️', '🤍', '💚'], cardSticker: '🇴🇲' },
  { key: 'party', floaters: ['🎉', '✨', '🎈'], cardSticker: '🎉' },
  { key: 'night', floaters: ['🌙', '⭐', '🏮'], cardSticker: '🌙' },
];

type DeleteTarget =
  | { type: 'category'; id: number; name: string; itemCount: number }
  | { type: 'item'; id: number; name: string };

/** Split typed emoji into whole graphemes (flags/ZWJ sequences stay intact). */
function splitGraphemes(s: string): string[] {
  // Intl.Segmenter is missing from our TS lib target but present in all modern browsers
  type Segmenter = new (locale?: string, opts?: { granularity: string }) => { segment(input: string): Iterable<{ segment: string }> };
  const Seg = (Intl as unknown as { Segmenter?: Segmenter }).Segmenter;
  if (Seg) return [...new Seg(undefined, { granularity: 'grapheme' }).segment(s)].map((g) => g.segment);
  return Array.from(s);
}

export default function MenuManager({ branchId }: { branchId?: number | null }) {
  const { user } = useAuth();
  const rid = user!.restaurantId!;
  const { lang } = useI18n();
  const t = useT(DICT);
  const toast = useToast();
  const qc = useQueryClient();

  const catsQ = useQuery({ queryKey: ['menu-cats', rid], queryFn: () => api.get<CategoryResponse[]>(`/api/menu/categories?restaurantId=${rid}`) });
  const itemsQ = useQuery({ queryKey: ['menu-items', rid], queryFn: () => api.get<MenuItemResponse[]>(`/api/menu/items?restaurantId=${rid}`) });
  const cats = useMemo(() => [...(catsQ.data ?? [])].sort((a, b) => a.displayOrder - b.displayOrder), [catsQ.data]);
  const itemsByCat = useMemo(() => {
    const m = new Map<number, MenuItemResponse[]>();
    (itemsQ.data ?? []).forEach((i) => { const a = m.get(i.categoryId) ?? []; a.push(i); m.set(i.categoryId, a); });
    m.forEach((a) => a.sort((x, y) => x.displayOrder - y.displayOrder));
    return m;
  }, [itemsQ.data]);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['menu-cats', rid] }); qc.invalidateQueries({ queryKey: ['menu-items', rid] }); };
  const err = (e: unknown) => toast(e instanceof ApiError ? e.message : 'Error');

  const toggleAvail = useMutation({
    mutationFn: (it: MenuItemResponse) => api.patch(`/api/menu/items/${it.id}/availability`, { available: !it.available }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menu-items', rid] }), onError: err,
  });
  const delItem = useMutation({ mutationFn: (id: number) => api.del(`/api/menu/items/${id}`), onSuccess: () => { invalidate(); setDeleteTarget(null); }, onError: err });
  const delCat = useMutation({ mutationFn: (id: number) => api.del(`/api/menu/categories/${id}`), onSuccess: () => { invalidate(); setDeleteTarget(null); }, onError: err });
  const deleting = delItem.isPending || delCat.isPending;
  const categoryDeleteBlocked = deleteTarget?.type === 'category' && deleteTarget.itemCount > 0;
  const confirmDelete = () => {
    if (!deleteTarget || deleting || categoryDeleteBlocked) return;
    if (deleteTarget.type === 'item') delItem.mutate(deleteTarget.id);
    else delCat.mutate(deleteTarget.id);
  };

  const [catModal, setCatModal] = useState<CategoryResponse | 'new' | null>(null);
  const [itemModal, setItemModal] = useState<MenuItemResponse | { categoryId: number } | null>(null);

  return (
    <div className="tables-wrap">
      <div className="tables-tool">
        <button className="btn sm" onClick={() => setCatModal('new')}>{t('addCat')}</button>
      </div>

      {catsQ.isLoading ? <div className="center"><div className="spinner" /></div>
        : cats.length === 0 ? <div className="empty"><div className="big">📋</div><h3>{t('empty')}</h3></div>
        : cats.map((c) => {
          const items = itemsByCat.get(c.id) ?? [];
          return (
            <section className="mcat" key={c.id}>
              <div className="mcat-hd">
                <div><h3>{pick(c, 'name', lang)}</h3><span className="mcat-sub">{c.nameEn} · {items.length} {t('items')}</span></div>
                <div className="mcat-actions">
                  <button className="btn sm ghost" onClick={() => setItemModal({ categoryId: c.id })}>{t('addItem')}</button>
                  <button className="iconbtn" title={t('editCat')} onClick={() => setCatModal(c)}>✎</button>
                  <button className="iconbtn danger" title={t('del')} onClick={() => setDeleteTarget({ type: 'category', id: c.id, name: pick(c, 'name', lang), itemCount: items.length })}>🗑</button>
                </div>
              </div>
              {items.length === 0 ? <div className="col-empty" style={{ marginTop: 4 }}>{t('noItems')}</div> : (
                <div className="mitems">
                  {items.map((it) => {
                    const ds = discountState(it);
                    return (
                    <div className={'mitem' + (it.available ? '' : ' off')} key={it.id}>
                      <div className="c-thumb" style={{ ...thumb(it), width: 54, height: 54, flex: '0 0 54px', borderRadius: 12 }}>
                        {!it.imageUrl && <span className="glyph" style={{ fontSize: 20 }}>{pick(it, 'name', lang).charAt(0)}</span>}
                      </div>
                      <div className="mitem-main">
                        <div className="mitem-name">{pick(it, 'name', lang)}
                          {ds && <span className={'mitem-disc ' + (ds.active ? 'on' : ds.scheduled ? 'sched' : 'ended')}>
                            {ds.active ? `−${discountPercent(it.price, ds.sale)}%` : ds.scheduled ? t('discScheduled') : t('discEnded')}
                          </span>}
                        </div>
                        <div className="mitem-sub">{it.nameEn}{it.preparationTimeMinutes ? ` · ⏱ ${it.preparationTimeMinutes}m` : ''}</div>
                      </div>
                      <div className="mitem-price num">
                        {ds && <span className="mitem-was">{omr(it.price)}</span>}
                        <span className={ds?.active ? 'mitem-sale' : ''}>{omr(ds ? ds.sale : it.price)}</span>
                        {' '}<span style={{ fontSize: 10, color: 'var(--muted)' }}>{t('cur')}</span>
                      </div>
                      <button className={'switch' + (it.available ? ' on' : '')} title={t('available')} onClick={() => toggleAvail.mutate(it)}><span /></button>
                      <button className="iconbtn" title={t('editItem')} onClick={() => setItemModal(it)}>✎</button>
                      <button className="iconbtn danger" title={t('del')} onClick={() => setDeleteTarget({ type: 'item', id: it.id, name: pick(it, 'name', lang) })}>🗑</button>
                    </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}

      {deleteTarget && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget && !deleting) setDeleteTarget(null); }}>
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="delete-menu-title">
            <h3 id="delete-menu-title">{t(deleteTarget.type === 'item' ? 'deleteItemTitle' : 'deleteCatTitle')}</h3>
            <div className="ph">
              <b style={{ display: 'block', color: 'var(--text)', marginBottom: 6 }}>{deleteTarget.name}</b>
              {categoryDeleteBlocked ? t('categoryHasItems') : t(deleteTarget.type === 'item' ? 'delItem' : 'delCat')}
            </div>
            <div className="modal-actions">
              <button className="btn ghost" disabled={deleting} onClick={() => setDeleteTarget(null)}>{t('cancel')}</button>
              {!categoryDeleteBlocked && (
                <button className="btn danger" disabled={deleting} onClick={confirmDelete}>
                  {deleting ? t('deleting') : t('deleteConfirm')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {catModal && <CategoryEditor rid={rid} cat={catModal === 'new' ? null : catModal} onClose={() => setCatModal(null)} onDone={() => { invalidate(); setCatModal(null); }} />}
      {itemModal && <ItemEditor rid={rid} cats={cats} branchId={branchId} item={'id' in itemModal ? itemModal : null} defaultCat={'categoryId' in itemModal ? itemModal.categoryId : undefined} onClose={() => setItemModal(null)} onDone={() => { invalidate(); setItemModal(null); }} />}
    </div>
  );
}

export function MenuLookManager({ branchId }: { branchId?: number }) {
  const { user } = useAuth();
  const rid = user!.restaurantId!;
  const t = useT(DICT);
  const toast = useToast();
  const qc = useQueryClient();
  const confirm = useConfirm();
  // The whole look is one JSON document (draft); presets only prefill it. activeId
  // remembers which preset the draft came from ('custom' once the owner tweaks it).
  const [draft, setDraft] = useState<MenuThemeCustom>(DEFAULT_CUSTOM_THEME);
  const [activeId, setActiveId] = useState<string>(CUSTOM_THEME);
  // Snapshot of what's actually saved on the server, so we can tell the owner their
  // draft has unsaved edits (dirty = draft/activeId drifted from this pair).
  const [savedSnapshot, setSavedSnapshot] = useState<{ activeId: string; json: string }>(
    { activeId: CUSTOM_THEME, json: serializeCustomTheme(DEFAULT_CUSTOM_THEME) },
  );
  const dirty = activeId !== savedSnapshot.activeId || serializeCustomTheme(draft) !== savedSnapshot.json;

  // The editor shows every selectable display font (picker chips + live preview),
  // so it needs the full set — venues' menus load only their own font.
  useEffect(() => { ensureGoogleFonts(ALL_MENU_FONT_SPECS); }, []);

  const restaurantQ = useQuery({ queryKey: ['restaurant', rid], queryFn: () => api.get<Restaurant>(`/api/restaurants/${rid}`) });
  const catsQ = useQuery({ queryKey: ['menu-cats', rid], queryFn: () => api.get<CategoryResponse[]>(`/api/menu/categories?restaurantId=${rid}`) });
  const itemsQ = useQuery({ queryKey: ['menu-items', rid], queryFn: () => api.get<MenuItemResponse[]>(`/api/menu/items?restaurantId=${rid}`) });
  const cats = useMemo(() => [...(catsQ.data ?? [])].sort((a, b) => a.displayOrder - b.displayOrder), [catsQ.data]);
  const itemsByCat = useMemo(() => {
    const m = new Map<number, MenuItemResponse[]>();
    (itemsQ.data ?? []).forEach((i) => { const a = m.get(i.categoryId) ?? []; a.push(i); m.set(i.categoryId, a); });
    m.forEach((a) => a.sort((x, y) => x.displayOrder - y.displayOrder));
    return m;
  }, [itemsQ.data]);

  const saveTheme = useMutation({
    mutationFn: () => api.patch<Restaurant>(`/api/restaurants/${rid}/theme`, { theme: activeId, themeCustomJson: serializeCustomTheme(draft) }),
    onSuccess: (r) => {
      qc.setQueryData(['restaurant', rid], r);
      toast(t('saved'));
      setSavedSnapshot({ activeId: r.theme ?? activeId, json: r.themeCustomJson ?? serializeCustomTheme(draft) });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  useEffect(() => {
    const r = restaurantQ.data;
    if (!r) return;
    const preset = THEME_PRESETS.find((p) => p.id === r.theme);
    let nextDraft: MenuThemeCustom;
    let nextActiveId: string;
    if (r.themeCustomJson) {
      nextDraft = parseCustomTheme(r.themeCustomJson);
      nextActiveId = r.theme ?? CUSTOM_THEME;
    } else if (preset) {
      // legacy preset save (id only, no JSON) — seed the editor from the preset document
      nextDraft = { ...preset.config };
      nextActiveId = preset.id;
    } else {
      nextDraft = DEFAULT_CUSTOM_THEME;
      nextActiveId = CUSTOM_THEME;
    }
    setDraft(nextDraft);
    setActiveId(nextActiveId);
    setSavedSnapshot({ activeId: nextActiveId, json: serializeCustomTheme(nextDraft) });
  }, [restaurantQ.data?.id, restaurantQ.data?.theme, restaurantQ.data?.themeCustomJson]);

  // An owner can sink real time into a look; warn before a tab close / reload throws
  // it away. (No router-level guard: the dashboard's tabs are plain state switches in
  // DashboardApp.tsx, not route changes, and the app's BrowserRouter has no data-router
  // context for useBlocker — so there's no in-SPA navigation to intercept from here.)
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const previewUrl = restaurantQ.data
    ? `/r/${restaurantQ.data.slug}${branchId != null ? `/b/${branchId}` : ''}`
    : null;
  const openPreview = () => {
    if (previewUrl) window.open(previewUrl, '_blank', 'noopener,noreferrer');
  };

  // Premium "Pro look" tier unlocks the advanced studio (structural kits, occasion decor,
  // theme JSON). Granted per café by a platform admin; admins themselves always have it.
  const premium = !!restaurantQ.data?.premiumLook || canUsePremiumThemes(user);

  const resetDraft = async () => {
    const ok = await confirm({
      title: t('resetConfirmTitle'),
      message: t('resetConfirmMsg'),
      confirmLabel: t('resetLook'),
      cancelLabel: t('cancel'),
      danger: true,
    });
    if (!ok) return;
    setActiveId(CUSTOM_THEME);
    setDraft(DEFAULT_CUSTOM_THEME);
  };

  return (
    <div className="tables-wrap look-page">
      <LookPanel
        draft={draft}
        activeId={activeId}
        saving={saveTheme.isPending}
        dirty={dirty}
        premium={premium}
        previewUrl={previewUrl}
        restaurant={restaurantQ.data}
        cats={cats}
        itemsByCat={itemsByCat}
        onPreview={openPreview}
        onChange={(next) => { setActiveId(CUSTOM_THEME); setDraft(next); }}
        onPresetPick={(preset) => { setActiveId(preset.id); setDraft({ ...preset.config }); }}
        onRandomize={() => { setActiveId(CUSTOM_THEME); setDraft(randomCustomTheme(draft, premium)); }}
        onReset={resetDraft}
        onSave={() => saveTheme.mutate()}
        t={t}
      />
    </div>
  );
}

/**
 * A native-feeling disclosure (button + aria-expanded/aria-controls + conditionally
 * rendered panel) used to tuck "Fine-tune" and "Advanced" out of the way until an
 * owner asks for them. Children unmount while closed so their inputs never trap tab
 * focus or fire hidden onChange handlers.
 */
function Disclosure({ id, title, subtitle, defaultOpen, children }:
  { id: string; title: string; subtitle?: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const panelId = `${id}-panel`;
  return (
    <div className={'look-disclosure' + (open ? ' open' : '')}>
      <button
        type="button"
        className="look-disclosure-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="look-disclosure-label">
          <b>{title}</b>
          {subtitle && <small>{subtitle}</small>}
        </span>
        <span className="look-disclosure-chevron" aria-hidden="true">⌄</span>
      </button>
      {open && <div className="look-disclosure-body" id={panelId}>{children}</div>}
    </div>
  );
}

function LookPanel({ draft, activeId, saving, dirty, premium, previewUrl, restaurant, cats, itemsByCat, onPreview, onChange, onPresetPick, onRandomize, onReset, onSave, t }:
  {
    draft: MenuThemeCustom;
    activeId: string;
    saving: boolean;
    dirty: boolean;
    premium: boolean;
    previewUrl: string | null;
    restaurant?: Restaurant;
    cats: CategoryResponse[];
    itemsByCat: Map<number, MenuItemResponse[]>;
    onPreview: () => void;
    onChange: (custom: MenuThemeCustom) => void;
    onPresetPick: (preset: MenuThemePreset) => void;
    onRandomize: () => void;
    onReset: () => void;
    onSave: () => void;
    t: (k: string) => string;
  }) {
  const { lang } = useI18n();
  // Import/export the whole look as a JSON document — the same shape an AI generator
  // emits. Paste → Load runs it through parseCustomTheme (sanitised, contrast-safe);
  // Copy serialises the current draft so owners can save or hand it back to a model.
  const [jsonText, setJsonText] = useState('');
  const [jsonErr, setJsonErr] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyJson = () => {
    const s = serializeCustomTheme(draft);
    setJsonText(s);
    setCopied(true);
    navigator.clipboard?.writeText(s).catch(() => {});
    setTimeout(() => setCopied(false), 1500);
  };
  const loadJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
      onChange(parseCustomTheme(jsonText));
      setJsonErr(false);
    } catch {
      setJsonErr(true);
    }
  };
  return (
    <div className="look-studio">
      {/* The stage is a fixed neutral canvas — it follows neither the dashboard theme nor
          the generated menu theme. Only the phone inside reflects the menu's colours. */}
      <section className="look-stage">
        <LivePreview draft={draft} restaurant={restaurant} cats={cats} itemsByCat={itemsByCat} />
      </section>

      <section className="look-controls">
        {SHOW_READY_THEMES && (
        <div className="look-control-block look-presets-block">
          <div className="look-control-title">{t('presets')}</div>
          <div className="look-theme-row">
            {THEME_PRESETS.map((preset) => (
              <button className={activeId === preset.id ? 'on' : ''} key={preset.id} type="button" onClick={() => onPresetPick(preset)}>
                <span className="look-theme-swatch" style={{ background: `linear-gradient(135deg, ${preset.config.paper} 0 48%, ${preset.config.accent} 48% 73%, ${preset.config.accent2} 73%)` }} />
                <b>{lang === 'ar' ? preset.labelAr : preset.labelEn}</b>
                <small>{lang === 'ar' ? preset.descAr : preset.descEn}</small>
              </button>
            ))}
          </div>
        </div>
        )}

        <div className="look-controls-head">
          <div>
            <span>{t('custom')}</span>
            <h4>{t('motifStudio')}</h4>
          </div>
        </div>

        <Disclosure id="look-finetune" title={t('fineTune')}>
          <div className="look-finetune-group">
            <div className="look-group-title">{t('grpTypography')}</div>
            <div className="look-control-block look-motif-block">
              <div className="look-control-title">{t('fontLbl')}</div>
              <div className="look-motif-row">
                {FONT_OPTIONS.map((font) => (
                  <button className={draft.font === font ? 'on' : ''} key={font} type="button" onClick={() => onChange({ ...draft, font })}>
                    <span style={{ fontFamily: FONT_STACKS[font] }}>أب</span>
                    <b>{t('ft_' + font)}</b>
                  </button>
                ))}
              </div>
            </div>

            <div className="look-control-block look-motif-block">
              <div className="look-control-title">{t('cornersLbl')}</div>
              <div className="look-motif-row">
                {RADIUS_OPTIONS.map((radius) => (
                  <button className={draft.radius === radius ? 'on' : ''} key={radius} type="button" onClick={() => onChange({ ...draft, radius })}>
                    <span>{radius === 'sharp' ? '▭' : radius === 'soft' ? '▢' : '◯'}</span>
                    <b>{t('r_' + radius)}</b>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {premium && (
          <div className="look-finetune-group">
            <div className="look-group-title">{t('grpCards')}</div>
            <div className="look-control-block look-motif-block">
              <div className="look-control-title">{t('cardStyleLbl')}</div>
              <div className="look-motif-row">
                {CARD_STYLE_OPTIONS.map((cs) => (
                  <button className={draft.cardStyle === cs ? 'on' : ''} key={cs} type="button" onClick={() => onChange({ ...draft, cardStyle: cs })}>
                    <span>{CARD_STYLE_MARKS[cs]}</span>
                    <b>{t('cs_' + cs)}</b>
                  </button>
                ))}
              </div>
            </div>

            <div className="look-control-block look-motif-block">
              <div className="look-control-title">{t('cardBadgeLbl')}</div>
              <div className="look-motif-row">
                {CARD_BADGE_OPTIONS.map((cb) => (
                  <button className={draft.cardBadge === cb ? 'on' : ''} key={cb} type="button" onClick={() => onChange({ ...draft, cardBadge: cb })}>
                    <span>{CARD_BADGE_MARKS[cb]}</span>
                    <b>{t('cb_' + cb)}</b>
                  </button>
                ))}
              </div>
            </div>

            <div className="look-control-block look-motif-block">
              <div className="look-control-title">{t('headerStyleLbl')}</div>
              <div className="look-motif-row">
                {HEADER_STYLE_OPTIONS.map((hs) => (
                  <button className={draft.headerStyle === hs ? 'on' : ''} key={hs} type="button" onClick={() => onChange({ ...draft, headerStyle: hs })}>
                    <span>{HEADER_STYLE_MARKS[hs]}</span>
                    <b>{t('hs_' + hs)}</b>
                  </button>
                ))}
              </div>
            </div>
          </div>
          )}

          <div className="look-finetune-group">
            <div className="look-group-title">{t('grpMotif')}</div>
            <div className="look-control-block look-motif-block">
              <div className="look-control-title">{t('motif')}</div>
              <div className="look-motif-row">
                {MOTIF_OPTIONS.map((motif) => (
                  <button className={draft.motif === motif ? 'on' : ''} key={motif} type="button" onClick={() => onChange({ ...draft, motif })}>
                    <span>{MOTIF_MARKS[motif]}</span>
                    <b>{t('mt_' + motif)}</b>
                  </button>
                ))}
              </div>
              <label className="look-range">
                <span>{t('motifOpacity')}</span>
                <input
                  type="range"
                  min="0.04"
                  max="0.3"
                  step="0.01"
                  disabled={draft.motif === 'none'}
                  value={draft.motifOpacity}
                  aria-label={t('motifOpacity')}
                  onChange={(e) => onChange({ ...draft, motifOpacity: Number(e.target.value) })}
                />
              </label>
            </div>

            {premium && (
            <div className="look-control-block look-motif-block">
              <div className="look-control-title">{t('stickersLbl')}</div>
              <div className="look-motif-row">
                {STICKER_PACKS.map((pack) => {
                  const on = JSON.stringify(draft.decor.floaters) === JSON.stringify(pack.floaters) && draft.decor.cardSticker === pack.cardSticker;
                  return (
                    <button className={on ? 'on' : ''} key={pack.key} type="button"
                      onClick={() => onChange({ ...draft, decor: { ...draft.decor, floaters: [...pack.floaters], cardSticker: pack.cardSticker } })}>
                      <span>{pack.floaters[0] ?? '—'}</span>
                      <b>{t('sp_' + pack.key)}</b>
                    </button>
                  );
                })}
              </div>
              <label className="look-range">
                <span>{t('stickerOpacity')}</span>
                <input
                  type="range"
                  min="0.06"
                  max="0.6"
                  step="0.02"
                  disabled={draft.decor.floaters.length === 0}
                  value={draft.decor.floaterOpacity}
                  aria-label={t('stickerOpacity')}
                  onChange={(e) => onChange({ ...draft, decor: { ...draft.decor, floaterOpacity: Number(e.target.value) } })}
                />
              </label>
              <div className="row2">
                <div className="field">
                  <label>{t('stickerFree')}</label>
                  <input
                    value={draft.decor.floaters.join(' ')}
                    placeholder="🌹 💐 🌷"
                    onChange={(e) => onChange({ ...draft, decor: { ...draft.decor, floaters: splitGraphemes(e.target.value).filter((g) => g.trim()).slice(0, 6) } })}
                  />
                </div>
                <div className="field">
                  <label>{t('cardStickerLbl')}</label>
                  <input
                    value={draft.decor.cardSticker}
                    placeholder="🌹"
                    onChange={(e) => onChange({ ...draft, decor: { ...draft.decor, cardSticker: splitGraphemes(e.target.value).filter((g) => g.trim()).pop() ?? '' } })}
                  />
                </div>
              </div>
              <div className="row2">
                <div className="field">
                  <label>{t('bannerArLbl')}</label>
                  <input
                    dir="rtl"
                    value={draft.decor.bannerAr}
                    placeholder="كل عام وكل أم بخير 🌹"
                    onChange={(e) => onChange({ ...draft, decor: { ...draft.decor, bannerAr: e.target.value.slice(0, 80) } })}
                  />
                </div>
                <div className="field">
                  <label>{t('bannerEnLbl')}</label>
                  <input
                    dir="ltr"
                    value={draft.decor.bannerEn}
                    placeholder="Happy Mother's Day 🌹"
                    onChange={(e) => onChange({ ...draft, decor: { ...draft.decor, bannerEn: e.target.value.slice(0, 80) } })}
                  />
                </div>
              </div>
            </div>
            )}
          </div>

          <div className="look-finetune-group">
            <div className="look-group-title">{t('colorStudio')}</div>
            <div className="look-control-block">
              <div className="look-colors">
                {MENU_COLOR_FIELDS.map((field) => (
                  <label className="look-color" key={field.key}>
                    <input
                      type="color"
                      value={draft[field.key]}
                      aria-label={t(field.label)}
                      onChange={(e) => {
                        // Picking text / secondary by hand marks it custom so it renders as chosen
                        // (not auto-corrected). Quick mix / Reset clear the flag and restore the guard.
                        const extra = field.key === 'text' ? { textCustom: true }
                          : field.key === 'muted' ? { mutedCustom: true } : {};
                        onChange({ ...draft, [field.key]: e.target.value, ...extra });
                      }}
                    />
                    <span className="look-color-chip" aria-hidden="true" style={{ background: draft[field.key] }} />
                    <span>{t(field.label)}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Disclosure>

        {premium && (
        <Disclosure id="look-advanced" title={t('advanced')}>
          <div className="look-control-block">
            <div className="look-control-title">{t('jsonTitle')}</div>
            <p className="look-json-hint">{t('jsonHint')}</p>
            <textarea
              className="look-json-box"
              dir="ltr"
              spellCheck={false}
              placeholder={t('jsonPlace')}
              value={jsonText}
              onChange={(e) => { setJsonText(e.target.value); setJsonErr(false); }}
            />
            {jsonErr && <div className="look-json-err">{t('jsonBad')}</div>}
            <div className="look-actions" style={{ marginTop: 10 }}>
              <button className="btn sm ghost" type="button" onClick={copyJson}>{copied ? t('jsonCopied') : t('jsonCopy')}</button>
              <button className="btn sm" type="button" disabled={!jsonText.trim()} onClick={loadJson}>{t('jsonLoad')}</button>
            </div>
          </div>
        </Disclosure>
        )}

        <div className="look-savebar">
          {dirty && <span className="look-dirty-badge" role="status">{t('unsavedBadge')}</span>}
          <div className="look-actions">
            <button className="btn sm ghost" type="button" onClick={onRandomize}>{t('shuffle')}</button>
            <button className="btn sm ghost" type="button" onClick={onReset}>{t('resetLook')}</button>
            <button className="btn sm ghost" type="button" disabled={!previewUrl} onClick={onPreview}>↗ {t('preview')}</button>
            <button className="btn sm" type="button" disabled={saving} onClick={onSave}>{t('saveLook')}</button>
          </div>
        </div>
      </section>
    </div>
  );
}

interface PreviewItemData { id: number; name: string; sub: string; desc: string; price: number; salePrice?: number | null; imageUrl: string | null }
interface PreviewSection { id: number; name: string; sub: string; desc: string; items: PreviewItemData[] }

const previewThumb = (it: PreviewItemData) => it.imageUrl
  ? { backgroundImage: `url('${it.imageUrl}')` }
  : { backgroundImage: `linear-gradient(155deg, hsl(${(Math.abs(it.id) * 47) % 360} 42% 34%) -30%, #15171C 70%)` };

/** Effective preview price: the sale price when discounted, else the regular price. */
const previewUnit = (it: PreviewItemData) => it.salePrice ?? it.price;

/** A few sample dishes so brand-new cafés (empty menu) still get a styled preview.
 *  Title follows the language; the English name is the Arabic-mode sub, like the real menu. */
function sampleSections(t: (k: string) => string): PreviewSection[] {
  return [
    { id: -1, name: t('sampleCat'), sub: 'Drinks', desc: t('sampleDesc'), items: [
      { id: -11, name: t('sampleItem'), sub: 'Omani latte', desc: t('sampleDesc'), price: 2.4, imageUrl: null },
      { id: -12, name: t('sampleItem3'), sub: 'Karak tea', desc: t('sampleDesc3'), price: 1.2, imageUrl: null },
      { id: -13, name: t('sampleItem5'), sub: 'Cold brew', desc: '', price: 1.6, imageUrl: null },
    ] },
    { id: -2, name: t('sampleCat2'), sub: 'Desserts', desc: '', items: [
      { id: -21, name: t('sampleItem2'), sub: 'Date cake', desc: t('sampleDesc2'), price: 1.8, imageUrl: null },
      { id: -22, name: t('sampleItem4'), sub: 'Zaatar croissant', desc: '', price: 1.6, imageUrl: null },
    ] },
  ];
}

const PREVIEW_FLOW = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY'] as const;

/**
 * Live phone preview: the cafe's REAL menu rendered with the draft theme, walking the
 * full customer journey — tap + to add, open the basket with VAT totals, place the
 * (fake) order and watch the tracking screen step through the statuses.
 * It always renders from the JSON draft, so what you see is exactly what saves.
 */
function LivePreview({ draft, restaurant, cats, itemsByCat }:
  { draft: MenuThemeCustom; restaurant?: Restaurant; cats: CategoryResponse[]; itemsByCat: Map<number, MenuItemResponse[]> }) {
  // The preview carries its OWN language: its EN/ع toggle flips only the phone, never the
  // surrounding dashboard. It just starts from whatever language the dashboard is in.
  const { lang: dashLang } = useI18n();
  const [previewLang, setPreviewLang] = useState(dashLang);
  const lang = previewLang;
  const t = (k: string) => DICT[previewLang][k] ?? DICT.ar[k] ?? k;
  const [cart, setCart] = useState<Record<number, number>>({});
  const [view, setView] = useState<'menu' | 'cart' | 'track'>('menu');
  const [activeCat, setActiveCat] = useState<number | null>(null);
  const [placed, setPlaced] = useState<{ lines: { it: PreviewItemData; qty: number }[]; total: number; orderNumber: number } | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const scrollRef = useRef<HTMLElement>(null);

  // walk the fake order through the statuses so every themed state gets seen
  useEffect(() => {
    if (view !== 'track' || stepIdx >= PREVIEW_FLOW.length - 1) return;
    const id = setTimeout(() => setStepIdx((i) => i + 1), 1800);
    return () => clearTimeout(id);
  }, [view, stepIdx]);

  const style = customThemeVars(draft) as CSSProperties;

  // Mirror the real customer menu exactly: the title follows the chosen language and,
  // in Arabic, the English name rides underneath as the sub-line (the EN/ع toggle in the
  // header flips it, just like the live menu).
  const sections = useMemo<PreviewSection[]>(() => {
    const real = cats
      .map((c) => ({
        id: c.id,
        name: pick(c, 'name', lang),
        sub: c.nameEn ?? '',
        desc: pick(c, 'description', lang) ?? '',
        items: (itemsByCat.get(c.id) ?? []).filter((i) => i.available).map((i) => {
          const ds = discountState(i);
          return { id: i.id, name: pick(i, 'name', lang), sub: i.nameEn ?? '', desc: pick(i, 'description', lang) ?? '', price: i.price, salePrice: ds?.active ? ds.sale : null, imageUrl: i.imageUrl ?? null };
        }),
      }))
      .filter((s) => s.items.length > 0);
    return real.length ? real : sampleSections(t);
  }, [cats, itemsByCat, lang, t]);

  const itemById = useMemo(() => {
    const m = new Map<number, PreviewItemData>();
    sections.forEach((s) => s.items.forEach((i) => m.set(i.id, i)));
    return m;
  }, [sections]);

  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ it: itemById.get(Number(id)), qty }))
    .filter((l): l is { it: PreviewItemData; qty: number } => !!l.it && l.qty > 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + previewUnit(l.it) * l.qty, 0);
  const vatEnabled = restaurant?.vatEnabled ?? false;
  const vat = estimateVat(subtotal, restaurant?.vatRate ?? 0, vatEnabled);
  const total = subtotal + vat;

  const bump = (id: number, delta: number) => setCart((c) => {
    const qty = (c[id] ?? 0) + delta;
    const next = { ...c };
    if (qty <= 0) delete next[id]; else next[id] = qty;
    if (Object.keys(next).length === 0) setView('menu');
    return next;
  });
  const gotoCat = (id: number) => {
    setActiveCat(id);
    scrollRef.current?.querySelector(`[data-cat="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const placeOrder = () => {
    if (lines.length === 0) return;
    setPlaced({ lines, total, orderNumber: 100 + Math.floor(Math.random() * 900) });
    setStepIdx(0);
    setView('track');
  };
  // Unlike the real menu, the preview's cart bar is always visible and tappable —
  // owners need to judge the cart screen's colors instantly. While the cart is empty
  // the bar advertises a two-item sample, and tapping it seeds those items.
  const seedLines = useMemo(() => {
    const flat = sections.flatMap((s) => s.items);
    return [flat[0] && { it: flat[0], qty: 2 }, flat[1] && { it: flat[1], qty: 1 }]
      .filter((l): l is { it: PreviewItemData; qty: number } => !!l);
  }, [sections]);
  const barLines = lines.length > 0 ? lines : seedLines;
  const barCount = barLines.reduce((s, l) => s + l.qty, 0);
  const barSubtotal = barLines.reduce((s, l) => s + previewUnit(l.it) * l.qty, 0);
  const openCart = () => {
    if (lines.length === 0) {
      const seed: Record<number, number> = {};
      seedLines.forEach((l) => { seed[l.it.id] = l.qty; });
      setCart(seed);
    }
    setView('cart');
  };
  const backToMenu = () => {
    setView('menu');
    setCart({});
    setPlaced(null);
    setStepIdx(0);
  };

  const cafeName = restaurant?.name ?? t('lookTitle');

  return (
    <div className="look-preview">
      <div className="look-preview-title">{t('phonePreview')}</div>
      <div className="look-preview-customer">
        <div className="cust-bg" data-menu-theme={CUSTOM_THEME} style={style} {...menuStructuralAttrs(draft)}>
          <div className="phone">
            <MenuDecorLayer decor={draft.decor} />
            {view === 'menu' ? (
              <>
                <header className="c-hdr">
                  <div className="c-hdr-top">
                    <div className="c-brand">
                      <div className={'c-mark' + (restaurant?.logoUrl ? ' has-logo' : '')}>
                        {restaurant?.logoUrl ? <img src={restaurant.logoUrl} alt={cafeName} /> : cafeName.charAt(0)}
                      </div>
                      <div>
                        <h1>{cafeName}</h1>
                      </div>
                    </div>
                    <div className="lang" role="group" aria-label="Language">
                      <button aria-pressed={previewLang === 'ar'} onClick={() => setPreviewLang('ar')} lang="ar">ع</button>
                      <button aria-pressed={previewLang === 'en'} onClick={() => setPreviewLang('en')} lang="en">EN</button>
                    </div>
                  </div>
                  <div className="c-meta">
                    <span className="c-table">🪑 {t('tableLbl')} <span className="num">5</span></span>
                  </div>
                </header>
                <nav className="c-nav">
                  {sections.map((s) => (
                    <button key={s.id} className={(activeCat ?? sections[0]?.id) === s.id ? 'on' : ''} onClick={() => gotoCat(s.id)}>
                      <span>{s.name}</span><em>{s.items.length}</em>
                    </button>
                  ))}
                </nav>
                <main className="c-scroll" ref={scrollRef}>
                  {sections.map((s) => (
                    <section className="c-cat" data-cat={s.id} key={s.id}>
                      <div className="c-cat-head"><h2>{s.name}</h2><span className="c-rule" />{lang === 'ar' && s.sub && <span className="en">{s.sub}</span>}</div>
                      {s.desc && <p className="c-cat-desc">{s.desc}</p>}
                      {s.items.map((it) => {
                        const qty = cart[it.id] ?? 0;
                        return (
                          <article className="c-item" key={it.id}>
                            <div className="c-thumb" style={previewThumb(it)}>
                              {!it.imageUrl && <span className="glyph">{it.name.charAt(0)}</span>}
                            </div>
                            <div className="c-body">
                              <h3>{it.name}</h3>
                              {lang === 'ar' && it.sub && <div className="sub">{it.sub}</div>}
                              {it.desc && <p>{it.desc}</p>}
                              <div className="c-foot">
                                <div className="c-price">
                                  {it.salePrice != null && <span className="c-was num">{omr(it.price)}</span>}
                                  <span className={'num' + (it.salePrice != null ? ' c-sale' : '')}>{omr(previewUnit(it))}</span>
                                  <span className="cur">{t('cur')}</span>
                                  {it.salePrice != null && <span className="c-off">−{discountPercent(it.price, it.salePrice)}%</span>}
                                </div>
                                {qty > 0
                                  ? <div className="c-qty">
                                      <button onClick={() => bump(it.id, 1)}>+</button>
                                      <span className="n num">{qty}</span>
                                      <button onClick={() => bump(it.id, -1)}>−</button>
                                    </div>
                                  : <button className="c-add" type="button" aria-label="add" onClick={() => bump(it.id, 1)}>+</button>}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </section>
                  ))}
                  <div className="c-bottom-spacer" />
                </main>
                <div className="c-cartbar show" onClick={openCart}>
                  <div className="ico">🛒<span className="count">{barCount}</span></div>
                  <div className="lbl"><b>{t('viewCart')}</b><span>{barCount} {t('items')}</span></div>
                  <div className="total"><span className="num">{omr(barSubtotal)}</span></div>
                  <div className="go">‹</div>
                </div>
              </>
            ) : view === 'cart' ? (
              <>
                <header className="c-vhdr">
                  <button className="c-back" onClick={() => setView('menu')} aria-label="back"><span className="arr">›</span></button>
                  <h2>{t('cartTitle')}</h2>
                </header>
                <div className="c-vbody">
                  {lines.map((l) => (
                    <div className="c-line" key={l.it.id}>
                      <div className="c-thumb" style={previewThumb(l.it)}>{!l.it.imageUrl && <span className="glyph">{l.it.name.charAt(0)}</span>}</div>
                      <div className="c-line-main">
                        <h4>{l.it.name}</h4>
                        <div className="lp"><span className="num">{omr(previewUnit(l.it))}</span> {t('cur')}</div>
                        <textarea className="c-notein" rows={1} placeholder={t('itemNote')} />
                      </div>
                      <div className="c-line-side">
                        <div className="c-qty">
                          <button onClick={() => bump(l.it.id, 1)}>+</button>
                          <span className="n num">{l.qty}</span>
                          <button onClick={() => bump(l.it.id, -1)}>−</button>
                        </div>
                        <div className="lt"><span className="num">{omr(previewUnit(l.it) * l.qty)}</span></div>
                      </div>
                    </div>
                  ))}
                  <div className="field"><label>{t('custName')}</label><input placeholder="…" /></div>
                  <div className="field"><label>{t('custPhone')}</label><input className="num" inputMode="tel" placeholder="9XXXXXXX" /></div>
                  <div className="field"><label>{t('orderNote')}</label><textarea rows={2} placeholder={t('orderNotePh')} /></div>

                  <div className="c-totals">
                    <div className="row"><span>{t('subtotal')}</span><span className="num">{omr(subtotal)} {t('cur')}</span></div>
                    {vatEnabled && <div className="row"><span>{t('vatLbl')} ({restaurant?.vatRate}%)</span><span className="num">{omr(vat)} {t('cur')}</span></div>}
                    <div className="row grand"><span>{t('totalLbl')}</span><span className="num">{omr(total)} {t('cur')}</span></div>
                    <div className="c-hint">{t('finalNote')}</div>
                  </div>
                </div>
                <div className="c-foot-bar">
                  <button className="btn full" type="button" onClick={placeOrder}>{t('place')} · <span className="num">{omr(total)}</span></button>
                </div>
              </>
            ) : placed && (
              <>
                <header className="c-vhdr">
                  <button className="c-back" onClick={backToMenu} aria-label="back"><span className="arr">›</span></button>
                  <h2>{t('trackTitle')}</h2>
                </header>
                <div className="c-vbody">
                  <div className="c-track">
                    <div className="no">{t('orderNo')} · <span className="num">{placed.orderNumber}</span></div>
                    <div className="state"><span className="c-pulse" />{t('head_' + PREVIEW_FLOW[stepIdx])}</div>
                    <div className="sub">{t('thanks')}</div>
                  </div>
                  <div className="c-stepper">
                    {PREVIEW_FLOW.map((st, i) => {
                      const cls = i < stepIdx ? 'done' : i === stepIdx ? 'active' : '';
                      const icon = i < stepIdx ? '✓' : i === stepIdx ? '●' : String(i + 1);
                      return (
                        <div className={'c-step ' + cls} key={st}>
                          <div className="dot">{icon}</div>
                          <div className="txt"><b>{t('st_' + st)}</b></div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {placed.lines.map((l) => (
                      <div className="c-totals" style={{ marginBottom: 0, padding: '11px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} key={l.it.id}>
                        <span><span className="num">{l.qty}×</span> {l.it.name}</span>
                        <span className="num">{omr(previewUnit(l.it) * l.qty)} {t('cur')}</span>
                      </div>
                    ))}
                  </div>
                  <div className="c-totals" style={{ marginTop: 14 }}>
                    <div className="row grand"><span>{t('totalLbl')}</span><span className="num">{omr(placed.total)} {t('cur')}</span></div>
                  </div>
                  <button className="btn full ghost" style={{ marginTop: 18 }} onClick={backToMenu}>{t('backMenu')}</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Hand-tuned, legible palettes. "Quick mix" picks one of these and only varies the
// accent hue a little plus the motif/background — so the text/background pairing is
// always a designed, readable combination instead of a random (often muddy) one.
type PaletteRecipe = Pick<MenuThemeCustom, 'paper' | 'surface' | 'text' | 'muted' | 'accent' | 'accent2' | 'cartBg'>;

const PALETTE_RECIPES: PaletteRecipe[] = [
  { paper: '#FBF5EC', surface: '#F1E3D1', text: '#2C1B12', muted: '#7A5B45', accent: '#C8862B', accent2: '#A8531C', cartBg: '#2B1A12' }, // warm café
  { paper: '#F2F8F2', surface: '#DEEEE2', text: '#143F2B', muted: '#4C7059', accent: '#2FBF71', accent2: '#2E9BD8', cartBg: '#103923' }, // fresh mint
  { paper: '#FFF1F4', surface: '#FBDFE7', text: '#5A2233', muted: '#8C5366', accent: '#FF5C89', accent2: '#FF9F3D', cartBg: '#4B1730' }, // sweet rose
  { paper: '#F1F6F4', surface: '#DCEAE6', text: '#0B3B47', muted: '#4F6F75', accent: '#1F8FA6', accent2: '#E2674A', cartBg: '#07333D' }, // coastal teal
  { paper: '#FBEEE0', surface: '#F2DBC4', text: '#4A1C0E', muted: '#7F523D', accent: '#D7521E', accent2: '#E8A23D', cartBg: '#3C160B' }, // souq spice
  { paper: '#F7F2E6', surface: '#E8E2CC', text: '#213B24', muted: '#5C6B45', accent: '#6D8C3B', accent2: '#C8833A', cartBg: '#213B24' }, // garden olive
  { paper: '#EEF6F8', surface: '#DBE9EE', text: '#123846', muted: '#516F7B', accent: '#227D9A', accent2: '#E0A43B', cartBg: '#123846' }, // tile blue
  { paper: '#F5F2FB', surface: '#E7E0F4', text: '#2E2247', muted: '#675B82', accent: '#7C5CD8', accent2: '#E08BB8', cartBg: '#241A3C' }, // lavender
  { paper: '#F0F6FB', surface: '#DDE9F3', text: '#15324A', muted: '#566F84', accent: '#2E86C8', accent2: '#F2A33C', cartBg: '#122A40' }, // sky citrus
  { paper: '#15120D', surface: '#241D14', text: '#F3ECDD', muted: '#B6A888', accent: '#D4AF6C', accent2: '#B07A36', cartBg: '#F0D89E' }, // dark gold
  { paper: '#10251E', surface: '#1B342B', text: '#F2E8D0', muted: '#A6BBAD', accent: '#C79A43', accent2: '#2EA37A', cartBg: '#F2E8D0' }, // dark emerald
  { paper: '#101417', surface: '#1A2024', text: '#EAF7F6', muted: '#9FB2B5', accent: '#32D6C8', accent2: '#FF6D9E', cartBg: '#EAF7F6' }, // neon night
  { paper: '#0E0F12', surface: '#1A1D22', text: '#F3F5F0', muted: '#A6ADA9', accent: '#10B981', accent2: '#34D399', cartBg: '#F3F5F0' }, // onyx green
];

function randomCustomTheme(current: MenuThemeCustom, premium: boolean): MenuThemeCustom {
  // avoid landing on the same palette twice in a row
  const pool = PALETTE_RECIPES.filter((r) => r.paper.toLowerCase() !== current.paper.toLowerCase());
  const recipe = (pool.length ? pool : PALETTE_RECIPES)[Math.floor(Math.random() * (pool.length ? pool.length : PALETTE_RECIPES.length))];
  const shift = Math.floor(Math.random() * 26) - 13; // ±13° keeps the accents harmonious but fresh
  const accent = rotateHue(recipe.accent, shift);
  const accent2 = rotateHue(recipe.accent2, shift);
  const motif = MOTIF_OPTIONS[1 + Math.floor(Math.random() * (MOTIF_OPTIONS.length - 1))];
  return {
    // Start from the default look, not the current draft: Quick mix wipes the theme
    // first so it produces a fresh, clean combination instead of layering a new palette
    // on top of accumulated font/radius/background/decor/skin edits.
    ...DEFAULT_CUSTOM_THEME,
    decor: { ...DEFAULT_CUSTOM_THEME.decor },
    canvas: recipe.paper,
    paper: recipe.paper,
    surface: recipe.surface,
    text: ensureContrast(recipe.text, recipe.paper, 7),     // body text — guarantee strong legibility
    muted: ensureContrast(recipe.muted, recipe.paper, 3.4), // secondary text — keep it readable too
    accent,
    accent2,
    motif,
    motifColor: Math.random() > 0.4 ? accent : accent2,
    motifOpacity: Number((0.1 + Math.random() * 0.12).toFixed(2)),
    cartBg: recipe.cartBg,
    // Structural kit is premium — only let "Quick mix" roam the layout space for cafés
    // that have it; free-tier stays on the default flat card/plain header (from the reset above).
    ...(premium ? {
      cardStyle: CARD_STYLE_OPTIONS[Math.floor(Math.random() * CARD_STYLE_OPTIONS.length)],
      cardBadge: CARD_BADGE_OPTIONS[Math.floor(Math.random() * CARD_BADGE_OPTIONS.length)],
      headerStyle: HEADER_STYLE_OPTIONS[Math.floor(Math.random() * HEADER_STYLE_OPTIONS.length)],
    } : {}),
  };
}

// Push a foreground colour away from the background until it clears a WCAG contrast
// ratio, so even an edited recipe can never produce unreadable text.
function ensureContrast(fg: string, bg: string, min: number): string {
  if (contrastRatio(fg, bg) >= min) return fg;
  const { h, s } = hexToHsl(fg);
  const darkBg = relLuminance(bg) < 0.4;
  for (let i = 0; i <= 100; i += 4) {
    const cand = hslToHex(h, s, darkBg ? i : 100 - i); // dark bg → lighten fg; light bg → darken fg
    if (contrastRatio(cand, bg) >= min) return cand;
  }
  return darkBg ? '#FFFFFF' : '#0B0B0B';
}

function contrastRatio(a: string, b: string): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function relLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(parseInt(clean.slice(0, 2), 16)) + 0.7152 * lin(parseInt(clean.slice(2, 4), 16)) + 0.0722 * lin(parseInt(clean.slice(4, 6), 16));
}

function rotateHue(hex: string, deg: number): string {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex((h + deg + 360) % 360, s, l);
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  let r = 0; let g = 0; let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return `#${toHex255((r + m) * 255)}${toHex255((g + m) * 255)}${toHex255((b + m) * 255)}`;
}

function toHex255(value: number): string {
  return Math.round(value).toString(16).padStart(2, '0');
}

function CategoryEditor({ rid, cat, onClose, onDone }: { rid: number; cat: CategoryResponse | null; onClose: () => void; onDone: () => void }) {
  const t = useT(DICT); const toast = useToast();
  const [f, setF] = useState({ nameAr: cat?.nameAr ?? '', nameEn: cat?.nameEn ?? '', descriptionAr: cat?.descriptionAr ?? '', descriptionEn: cat?.descriptionEn ?? '', displayOrder: cat?.displayOrder ?? 0 });
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
  const save = useMutation({
    mutationFn: () => cat
      ? api.patch(`/api/menu/categories/${cat.id}`, f)
      : api.post('/api/menu/categories', { restaurantId: rid, ...f }),
    onSuccess: onDone, onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });
  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <h3>{cat ? t('editCat') : t('newCat')}</h3>
        <div className="row2">
          <div className="field"><label>{t('nameAr')}</label><input value={f.nameAr} onChange={(e) => set('nameAr', e.target.value)} /></div>
          <div className="field"><label>{t('nameEn')}</label><input value={f.nameEn} onChange={(e) => set('nameEn', e.target.value)} /></div>
        </div>
        <div className="field"><label>{t('descAr')}</label><input value={f.descriptionAr} onChange={(e) => set('descriptionAr', e.target.value)} /></div>
        <div className="field"><label>{t('descEn')}</label><input value={f.descriptionEn} onChange={(e) => set('descriptionEn', e.target.value)} /></div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>{t('cancel')}</button>
          <button className="btn" disabled={!f.nameAr || !f.nameEn || save.isPending} onClick={() => save.mutate()}>{t('save')}</button>
        </div>
      </div>
    </div>
  );
}

function ItemEditor({ rid, cats, item, defaultCat, branchId, onClose, onDone }:
  { rid: number; cats: CategoryResponse[]; item: MenuItemResponse | null; defaultCat?: number; branchId?: number | null; onClose: () => void; onDone: () => void }) {
  const t = useT(DICT); const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const MAX_PHOTOS = 6;
  const initialImages = item ? (item.images?.length ? item.images : item.imageUrl ? [item.imageUrl] : []) : [];
  const [f, setF] = useState({
    categoryId: item?.categoryId ?? defaultCat ?? cats[0]?.id,
    nameAr: item?.nameAr ?? '', nameEn: item?.nameEn ?? '',
    descriptionAr: item?.descriptionAr ?? '', descriptionEn: item?.descriptionEn ?? '',
    price: item ? String(item.price) : '', preparationTimeMinutes: item?.preparationTimeMinutes ?? '',
    images: initialImages as string[], available: item?.available ?? true,
    discountType: (item?.discountType ?? '') as '' | 'PERCENT' | 'FIXED',
    discountValue: item?.discountValue != null ? String(item.discountValue) : '',
    discountStart: isoToLocalInput(item?.discountStartsAt),
    discountEnd: isoToLocalInput(item?.discountEndsAt),
  });
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []); if (!files.length) return;
    const room = MAX_PHOTOS - f.images.length;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of files.slice(0, room)) {
        const { url } = await upload('/api/uploads/menu-items', file);
        urls.push(url);
      }
      setF((p) => ({ ...p, images: [...p.images, ...urls].slice(0, MAX_PHOTOS) }));
    }
    catch (err) { toast(err instanceof ApiError ? err.message : 'Upload failed'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  const removeImageAt = (idx: number) => setF((p) => ({ ...p, images: p.images.filter((_, i) => i !== idx) }));
  const makeCover = (idx: number) => setF((p) => (idx === 0 ? p : { ...p, images: [p.images[idx], ...p.images.filter((_, i) => i !== idx)] }));

  // Options the customer picks (e.g. Small/Large, milk type). No group name — they're just
  // "Options". Backend models them as one group, so we wrap them under an auto-named group on
  // save. Editing is a full replace; historical orders snapshot their options as JSON, so the
  // rebuilt option ids don't affect past orders. (Legacy items with several groups show the first.)
  type OptRow = { nameAr: string; nameEn: string; priceDelta: string };
  const seedGroup = item?.optionGroups?.[0];
  const [opts, setOpts] = useState<OptRow[]>(
    (seedGroup?.options ?? []).map((o) => ({ nameAr: o.nameAr, nameEn: o.nameEn, priceDelta: o.priceDelta ? String(o.priceDelta) : '' })),
  );
  const [optType, setOptType] = useState<'SINGLE' | 'MULTI'>(seedGroup?.selectionType === 'MULTI' ? 'MULTI' : 'SINGLE');
  const [optReq, setOptReq] = useState<boolean>(seedGroup?.required ?? false);
  const patchOption = (oi: number, patch: Partial<OptRow>) => setOpts((p) => p.map((o, j) => (j === oi ? { ...o, ...patch } : o)));
  const addOption = () => setOpts((p) => [...p, { nameAr: '', nameEn: '', priceDelta: '' }]);
  const removeOption = (oi: number) => setOpts((p) => p.filter((_, j) => j !== oi));

  // Stock lives in its own panel rather than inline: it saves against a different endpoint and
  // needs the item to already exist (its recipe hangs off the item and option ids).
  const [recipeOpen, setRecipeOpen] = useState(false);

  const save = useMutation({
    mutationFn: () => {
      const hadImage = Boolean(item?.imageUrl || item?.images?.length);
      const body: any = {
        categoryId: f.categoryId, nameAr: f.nameAr, nameEn: f.nameEn,
        descriptionAr: f.descriptionAr || null, descriptionEn: f.descriptionEn || null,
        price: Number(f.price),
        // Discount: null type clears it; otherwise send value + optional window (as ISO instants).
        discountType: f.discountType || null,
        discountValue: f.discountType ? Number(f.discountValue) : null,
        discountStartsAt: f.discountType ? localInputToIso(f.discountStart) : null,
        discountEndsAt: f.discountType ? localInputToIso(f.discountEnd) : null,
        imageUrl: f.images[0] ?? null,
        imageUrls: f.images,
        preparationTimeMinutes: f.preparationTimeMinutes ? Number(f.preparationTimeMinutes) : null,
        available: f.available,
        optionGroups: (() => {
          const clean = opts.filter((o) => o.nameAr.trim() && o.nameEn.trim());
          if (!clean.length) return [];
          return [{
            nameAr: 'خيارات', nameEn: 'Options', selectionType: optType, required: optReq, displayOrder: 0,
            options: clean.map((o, oi) => ({
              nameAr: o.nameAr.trim(), nameEn: o.nameEn.trim(),
              priceDelta: o.priceDelta ? Number(o.priceDelta) : 0, displayOrder: oi,
            })),
          }];
        })(),
      };
      if (item) body.removeImage = hadImage && f.images.length === 0;
      return item ? api.patch(`/api/menu/items/${item.id}`, body) : api.post('/api/menu/items', { restaurantId: rid, ...body });
    },
    onSuccess: onDone, onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  // Live discounted price + validity, mirroring the server's rules (percent < 100, sale < price,
  // end after start). Drives the inline "Now" preview and gates the Save button.
  const priceNum = Number(f.price);
  const discValNum = Number(f.discountValue);
  const discountSale = f.discountType === 'PERCENT'
    ? (priceNum > 0 && discValNum > 0 && discValNum < 100 ? Math.round((priceNum * (100 - discValNum)) / 100 * 1000) / 1000 : null)
    : f.discountType === 'FIXED'
      ? (discValNum > 0 && discValNum < priceNum ? discValNum : null)
      : null;
  const windowValid = !f.discountStart || !f.discountEnd || new Date(f.discountEnd) > new Date(f.discountStart);
  const discountValid = !f.discountType || (discountSale != null && windowValid);
  const valid = f.nameAr && f.nameEn && Number(f.price) > 0 && f.categoryId && discountValid;

  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card item-modal">
        <h3>{item ? t('editItem') : t('newItem')}</h3>
        <div className="itemedit">
          <div className="imgedit">
            <div className="imggrid">
              {f.images.map((url, i) => (
                <div className="imgthumb" key={url + i} style={{ backgroundImage: `url('${url}')` }}>
                  {i === 0 && <span className="imgthumb-cover">{t('cover')}</span>}
                  <button type="button" className="imgthumb-x" title={t('removeImg')} disabled={uploading} onClick={() => removeImageAt(i)}>✕</button>
                  {i !== 0 && <button type="button" className="imgthumb-star" title={t('cover')} disabled={uploading} onClick={() => makeCover(i)}>☆</button>}
                </div>
              ))}
              {f.images.length < MAX_PHOTOS && (
                <button type="button" className="imgpick" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  <span>{uploading ? t('uploading') : '＋ ' + t('addPhoto')}</span>
                </button>
              )}
            </div>
            <div className="imghint">{t('photosHint')}</div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden multiple onChange={onFile} />
          <div style={{ flex: 1 }}>
            <div className="field"><label>{t('category')}</label>
              <select value={f.categoryId} onChange={(e) => set('categoryId', Number(e.target.value))}>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.nameAr} / {c.nameEn}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="row2">
          <div className="field"><label>{t('nameAr')}</label><input value={f.nameAr} onChange={(e) => set('nameAr', e.target.value)} /></div>
          <div className="field"><label>{t('nameEn')}</label><input value={f.nameEn} onChange={(e) => set('nameEn', e.target.value)} /></div>
        </div>
        <div className="row2">
          <div className="field"><label>{t('price')} ({t('cur')})</label><input className="num" type="number" step="0.001" value={f.price} onChange={(e) => set('price', e.target.value)} /></div>
          <div className="field"><label>{t('prep')}</label><input className="num" type="number" value={f.preparationTimeMinutes} onChange={(e) => set('preparationTimeMinutes', e.target.value)} /></div>
        </div>

        <div className="field discedit">
          <label>{t('discount')}</label>
          <div className="optseg discseg">
            <button type="button" className={!f.discountType ? 'on' : ''} onClick={() => set('discountType', '')}>{t('discNone')}</button>
            <button type="button" className={f.discountType === 'PERCENT' ? 'on' : ''} onClick={() => set('discountType', 'PERCENT')}>{t('discPercent')}</button>
            <button type="button" className={f.discountType === 'FIXED' ? 'on' : ''} onClick={() => set('discountType', 'FIXED')}>{t('discFixed')}</button>
          </div>
          {f.discountType && (
            <>
              <div className="row2" style={{ marginTop: 10 }}>
                <div className="field">
                  <label>{f.discountType === 'PERCENT' ? t('discPercentVal') : t('discNewPrice')}</label>
                  <input className="num" type="number" step={f.discountType === 'PERCENT' ? '1' : '0.001'} min="0"
                    value={f.discountValue} onChange={(e) => set('discountValue', e.target.value)} />
                </div>
                <div className="field">
                  <label>{t('discResult')}</label>
                  <div className="disc-now num">
                    {discountSale != null
                      ? <>{omr(discountSale)} {t('cur')}{f.discountType === 'PERCENT' && discountSale < priceNum && <span className="mitem-disc on">−{discountPercent(priceNum, discountSale)}%</span>}</>
                      : '—'}
                  </div>
                </div>
              </div>
              <div className="row2">
                <div className="field"><label>{t('discStarts')}</label><input type="datetime-local" value={f.discountStart} onChange={(e) => set('discountStart', e.target.value)} /></div>
                <div className="field"><label>{t('discEnds')}</label><input type="datetime-local" value={f.discountEnd} onChange={(e) => set('discountEnd', e.target.value)} /></div>
              </div>
            </>
          )}
        </div>

        <div className="field"><label>{t('descAr')}</label><input value={f.descriptionAr} onChange={(e) => set('descriptionAr', e.target.value)} /></div>
        <div className="field"><label>{t('descEn')}</label><input value={f.descriptionEn} onChange={(e) => set('descriptionEn', e.target.value)} /></div>
        <label className="checkrow"><input type="checkbox" checked={f.available} onChange={(e) => set('available', e.target.checked)} /> {t('available')}</label>

        <div className="optedit">
          <div className="optedit-hd">
            <div><b>{t('options')}</b><span className="optedit-hint">{t('optionsHint')}</span></div>
          </div>
          {opts.length > 0 && (
            <div className="optgroup-ctl">
              <div className="optseg">
                <button type="button" className={optType === 'SINGLE' ? 'on' : ''} onClick={() => setOptType('SINGLE')}>{t('single')}</button>
                <button type="button" className={optType === 'MULTI' ? 'on' : ''} onClick={() => setOptType('MULTI')}>{t('multi')}</button>
              </div>
              <label className="checkrow sm"><input type="checkbox" checked={optReq} onChange={(e) => setOptReq(e.target.checked)} /> {t('requiredOpt')}</label>
            </div>
          )}
          {opts.map((o, oi) => (
            <div className="optrow" key={oi}>
              <input placeholder={t('optNameAr')} value={o.nameAr} onChange={(e) => patchOption(oi, { nameAr: e.target.value })} />
              <input placeholder={t('optNameEn')} value={o.nameEn} onChange={(e) => patchOption(oi, { nameEn: e.target.value })} />
              <input className="num optdelta" type="number" step="0.001" placeholder={t('priceDelta')} value={o.priceDelta} onChange={(e) => patchOption(oi, { priceDelta: e.target.value })} />
              <button type="button" className="optx" title={t('del')} onClick={() => removeOption(oi)}>✕</button>
            </div>
          ))}
          <button type="button" className="btn sm ghost optadd" onClick={addOption}>{t('addOption')}</button>
        </div>

        <div className="modal-actions">
          {item && (
            <button className="btn ghost" style={{ marginInlineEnd: 'auto' }} onClick={() => setRecipeOpen(true)}>
              🧾 {t('stockRecipe')}
            </button>
          )}
          <button className="btn ghost" onClick={onClose}>{t('cancel')}</button>
          <button className="btn" disabled={!valid || save.isPending || uploading} onClick={() => save.mutate()}>{t('save')}</button>
        </div>
      </div>
      {recipeOpen && item && <RecipeEditor item={item} branchId={branchId} onClose={() => setRecipeOpen(false)} />}
    </div>
  );
}
