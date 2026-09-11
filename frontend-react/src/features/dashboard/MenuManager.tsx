import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, upload, ApiError } from '../../lib/api';
import { useAuth, can } from '../../lib/auth';
import { useI18n, useT, pick, nameOf, Ltr, type Dict } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import { useConfirm } from '../../lib/confirm';
import { omr, estimateVat, discountPercent } from '../../lib/format';
import type { BranchResponse, CategoryResponse, MenuItemResponse, Restaurant } from '../../lib/types';
import { sellable } from '../../lib/types';
import { ensureGoogleFonts } from '../../lib/fonts';
import { MenuDecorLayer } from '../customer/MenuDecor';
import { StockRules, saveStockDraft, type StockDraft } from './stock/StockRules';
import { parseMenuInfo, houseFacts } from '../customer/menuInfo';
import { HouseCardToggle } from './RestaurantProfile';
import {
  ALL_MENU_FONT_SPECS,
  CUSTOM_THEME,
  DEFAULT_CUSTOM_THEME,
  FONT_OPTIONS,
  FONT_STACKS,
  LAYOUT_OPTIONS,
  RADIUS_OPTIONS,
  applyBasicColor,
  basicColorOf,
  customThemeVars,
  menuStructuralAttrs,
  parseCustomTheme,
  serializeCustomTheme,
  type BasicColorKey,
  type MenuLayoutKey,
  type MenuThemeCustom,
} from '../customer/menuThemes';
import '../customer/customer.css';
import '../customer/menu-themes.css';
import '../customer/menu-layouts.css';
import './look-studio.css';

const DICT: Dict = {
  ar: { addCat: '＋ قسم', addItem: '＋ صنف', editCat: 'تعديل القسم', newCat: 'قسم جديد', editItem: 'تعديل الصنف', newItem: 'صنف جديد',
        nameAr: 'الاسم (عربي)', nameEn: 'الاسم (إنجليزي)', descAr: 'الوصف (عربي)', descEn: 'الوصف (إنجليزي)',
        price: 'السعر', prep: 'دقائق التحضير', category: 'القسم', available: 'متوفر الآن', image: 'الصورة', uploadImg: 'رفع صورة', uploading: 'جارٍ الرفع…', removeImg: 'حذف الصورة',
        addPhoto: 'إضافة صورة', cover: 'الغلاف', photosHint: 'الصورة الأولى هي الغلاف',
        options: 'الخيارات', optionsHint: 'مثل: الحجم (كبير/صغير) أو نوع الحليب', addGroup: '＋ مجموعة خيارات', groupNameAr: 'اسم المجموعة (ع)', groupNameEn: 'اسم المجموعة (EN)',
        single: 'اختيار واحد', multi: 'متعدد', requiredOpt: 'إلزامي', addOption: '＋ خيار', optNameAr: 'الخيار (ع)', optNameEn: 'الخيار (EN)', priceDelta: 'فرق السعر',
        save: 'حفظ', cancel: 'إلغاء', del: 'حذف', cur: 'ر.ع', noItems: 'لا أصناف بعد',
        discount: 'الخصم', discNone: 'بدون', discPercent: 'نسبة %', discFixed: 'سعر العرض',
        discPercentVal: 'نسبة الخصم %', discNewPrice: 'السعر بعد الخصم', discStarts: 'يبدأ (اختياري)', discEnds: 'ينتهي (اختياري)',
        discResult: 'السعر الآن', discScheduled: 'مجدول', discEnded: 'منتهٍ', saleBadge: 'عرض',
        delCat: 'لا يمكن حذف قسم فيه أصناف. احذف الأصناف أولاً.', delItem: 'سيختفي الصنف من قائمة العملاء. الطلبات القديمة تبقى محفوظة.',
        deleteCatTitle: 'حذف القسم', deleteItemTitle: 'حذف الصنف', deleteConfirm: 'حذف الآن', deleting: 'جارٍ الحذف…',
        categoryHasItems: 'هذا القسم فيه أصناف. احذف الأصناف أولاً ثم ارجع لحذف القسم.',
        empty: 'لا توجد أقسام — ابدأ بإضافة قسم', items: 'أصناف',
        lookTitle: 'شكل قائمة العملاء',
        preview: 'فتح المعاينة', saveLook: 'حفظ الشكل', saved: 'تم الحفظ', resetLook: 'رجوع للأصل',
        colorStudio: 'ألوان مقهاك', col_background: 'الخلفية', col_accent: 'اللون المميز', phonePreview: 'المعاينة الحية',
        colorHint: 'لونان فقط: الخلفية واللون المميز. الباقي يُشتق منهما بحيث يبقى النص مقروءاً دائماً.',
        houseEmptyPreview: 'البطاقة مفعّلة لكن لا يوجد نص بعد — اكتبه في صفحة «المقهى».',
        fontLbl: 'الخط', cornersLbl: 'الحواف', r_sharp: 'حادة', r_soft: 'ناعمة', r_round: 'دائرية',
        ft_system: 'الافتراضي', ft_markazi: 'مركزي', ft_baloo: 'بالو', ft_tajawal: 'تجوال', ft_elmessiri: 'المسيري', ft_reemkufi: 'ريم كوفي', ft_sora: 'سورا',
        unsavedBadge: 'تغييرات غير محفوظة', resetConfirmTitle: 'إعادة الضبط الافتراضي؟', resetConfirmMsg: 'سيتم فقد كل التعديلات غير المحفوظة والرجوع للتصميم الافتراضي.',
        sampleCat: 'المشروبات', sampleCat2: 'الحلويات', sampleCat3: 'الفطور',
        sampleItem: 'لاتيه عماني', sampleItem2: 'كيكة تمر', sampleItem3: 'شاي كرك', sampleItem4: 'كرواسون زعتر', sampleItem5: 'قهوة باردة',
        sampleDesc: 'حليب، قهوة عربية، هيل', sampleDesc2: 'تمر، طحينة، رشة بحرية', sampleDesc3: 'شاي أسود، حليب، زعفران', samplePrice: '٢.٤٠', viewCart: 'عرض السلة',
        layoutLbl: 'شكل عرض الأصناف', lay_list: 'قائمة', lay_gallery: 'معرض',
        lay_listHint: 'سطر مضغوط لكل صنف مع صورة صغيرة — الأنسب للقوائم الطويلة.',
        lay_galleryHint: 'صورة كبيرة لكل صنف — الأنسب للقوائم القصيرة المصوّرة جيداً.',
        galleryGate: 'من الأصناف لديها صورة.',
        galleryGateLow: 'الأصناف بلا صورة ستظهر كحرف ملوّن. صوّرها أولاً أو ابقَ على «قائمة».',
        cartTitle: 'سلّتك', subtotal: 'المجموع الفرعي', vatLbl: 'الضريبة', totalLbl: 'الإجمالي', place: 'إرسال الطلب', tableLbl: 'طاولة',
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
        single: 'Pick one', multi: 'Multiple', requiredOpt: 'Required', addOption: '＋ Option', optNameAr: 'Option (AR)', optNameEn: 'Option (EN)', priceDelta: 'Price +/-',
        save: 'Save', cancel: 'Cancel', del: 'Delete', cur: 'OMR', noItems: 'No items yet',
        discount: 'Discount', discNone: 'None', discPercent: '% off', discFixed: 'Sale price',
        discPercentVal: 'Percent off', discNewPrice: 'New price', discStarts: 'Starts (optional)', discEnds: 'Ends (optional)',
        discResult: 'Now', discScheduled: 'Scheduled', discEnded: 'Ended', saleBadge: 'Sale',
        delCat: 'A category with items cannot be deleted. Delete the items first.', delItem: 'This item will disappear from the customer menu. Old orders stay saved.',
        deleteCatTitle: 'Delete category', deleteItemTitle: 'Delete item', deleteConfirm: 'Delete now', deleting: 'Deleting…',
        categoryHasItems: 'This category still has items. Delete the items first, then come back to delete the category.',
        empty: 'No categories — add one to start', items: 'items',
        lookTitle: 'Customer menu look',
        preview: 'Open preview', saveLook: 'Save look', saved: 'Saved', resetLook: 'Reset default',
        colorStudio: "Your café's colours", col_background: 'Background', col_accent: 'Accent', phonePreview: 'Live preview',
        colorHint: 'Two colours only: the page and your accent. The rest is derived from them, so the text stays readable whatever you pick.',
        houseEmptyPreview: 'The card is on, but nothing is written yet — add the words on the Café page.',
        fontLbl: 'Font', cornersLbl: 'Corners', r_sharp: 'Sharp', r_soft: 'Soft', r_round: 'Round',
        ft_system: 'Default', ft_markazi: 'Markazi', ft_baloo: 'Baloo', ft_tajawal: 'Tajawal', ft_elmessiri: 'El Messiri', ft_reemkufi: 'Reem Kufi', ft_sora: 'Sora',
        unsavedBadge: 'Unsaved changes', resetConfirmTitle: 'Reset to default?', resetConfirmMsg: 'This clears every unsaved change and restores the starting look.',
        sampleCat: 'Drinks', sampleCat2: 'Desserts', sampleCat3: 'Breakfast',
        sampleItem: 'Omani latte', sampleItem2: 'Date cake', sampleItem3: 'Karak tea', sampleItem4: 'Zaatar croissant', sampleItem5: 'Cold brew',
        sampleDesc: 'Milk, Arabic coffee, cardamom', sampleDesc2: 'Dates, tahini, sea salt', sampleDesc3: 'Black tea, milk, saffron', samplePrice: '2.40', viewCart: 'View cart',
        layoutLbl: 'How items are shown', lay_list: 'List', lay_gallery: 'Gallery',
        lay_listHint: 'A compact row per item with a small photo — best for long menus.',
        lay_galleryHint: 'A big photo per item — best for short, well-photographed menus.',
        galleryGate: 'of your items have a photo.',
        galleryGateLow: 'Items without one show a coloured initial. Shoot them first, or stay on List.',
        cartTitle: 'Your cart', subtotal: 'Subtotal', vatLbl: 'VAT', totalLbl: 'Total', place: 'Place order', tableLbl: 'Table',
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

/**
 * The whole colour surface an owner gets: their brand's accent and the page it sits on.
 * Everything else a look is made of — font, corners, motif, card style, badge, header —
 * belongs to the theme, so a café cannot land halfway between two designs. Both picks run
 * through applyBasicColor, which keeps the WCAG guard on; the old third pick (text) is
 * gone because it was the one control that could switch that guard off.
 */
const BASIC_COLOR_FIELDS: { key: BasicColorKey; label: string }[] = [
  { key: 'background', label: 'col_background' },
  { key: 'accent', label: 'col_accent' },
];

// Below this share of photographed items, Gallery starts showing more coloured initials
// than photographs — the point where it becomes a worse menu than List, not a prettier one.
const GALLERY_PHOTO_FLOOR = 0.6;

type DeleteTarget =
  | { type: 'category'; id: number; name: string; itemCount: number }
  | { type: 'item'; id: number; name: string };

/** `branchId` is the branch the shell has selected: the stock rules on an item are per branch. */
export default function MenuManager({ branchId }: { branchId?: number }) {
  const { user } = useAuth();
  const rid = user!.restaurantId!;
  const { lang } = useI18n();
  const t = useT(DICT);
  const toast = useToast();
  const qc = useQueryClient();

  const catsQ = useQuery({ queryKey: ['menu-cats', rid], queryFn: () => api.get<CategoryResponse[]>(`/api/menu/categories?restaurantId=${rid}`) });
  const itemsQ = useQuery({
    queryKey: ['menu-items', rid],
    queryFn: () => api.get<MenuItemResponse[]>(`/api/menu/items?restaurantId=${rid}`),
  });
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
                    <div className={'mitem' + (sellable(it) ? '' : ' off')} key={it.id}>
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
                      <button className={'switch' + (sellable(it) ? ' on' : '')}
                        title={t('available')}
                        onClick={() => toggleAvail.mutate(it)}><span /></button>
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
      {itemModal && <ItemEditor rid={rid} branchId={branchId} cats={cats} item={'id' in itemModal ? itemModal : null} defaultCat={'categoryId' in itemModal ? itemModal.categoryId : undefined} onClose={() => setItemModal(null)} onDone={() => { invalidate(); setItemModal(null); }} />}
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
  // The look is one JSON document and nothing else — no preset id standing behind it. The
  // `theme` column is still written (CUSTOM_THEME) so the customer app keeps its legacy
  // fallback, but every choice on this screen lives in the document.
  const [draft, setDraft] = useState<MenuThemeCustom>(DEFAULT_CUSTOM_THEME);
  // Snapshot of what's actually saved on the server, so we can tell the owner their
  // draft has unsaved edits.
  const [savedJson, setSavedJson] = useState<string>(serializeCustomTheme(DEFAULT_CUSTOM_THEME));
  const dirty = serializeCustomTheme(draft) !== savedJson;

  // The font picker names each face in its own type, so the editor needs the full set —
  // a venue's live menu still loads only the one font it actually uses.
  useEffect(() => { ensureGoogleFonts(ALL_MENU_FONT_SPECS); }, []);

  const restaurantQ = useQuery({ queryKey: ['restaurant', rid], queryFn: () => api.get<Restaurant>(`/api/restaurants/${rid}`) });
  const catsQ = useQuery({ queryKey: ['menu-cats', rid], queryFn: () => api.get<CategoryResponse[]>(`/api/menu/categories?restaurantId=${rid}`) });
  const itemsQ = useQuery({ queryKey: ['menu-items', rid], queryFn: () => api.get<MenuItemResponse[]>(`/api/menu/items?restaurantId=${rid}`) });
  // Shares the cache key the dashboard shell already fills, so this is normally a cache
  // hit. The house card's hours/area chips are read from the branch, and the preview has
  // to show the real ones or it is not a preview.
  const branchesQ = useQuery({ queryKey: ['branches', rid], queryFn: () => api.get<BranchResponse[]>(`/api/restaurants/${rid}/branches`) });
  const branch = branchesQ.data?.find((b) => b.id === branchId) ?? branchesQ.data?.[0];
  const cats = useMemo(() => [...(catsQ.data ?? [])].sort((a, b) => a.displayOrder - b.displayOrder), [catsQ.data]);
  const itemsByCat = useMemo(() => {
    const m = new Map<number, MenuItemResponse[]>();
    (itemsQ.data ?? []).forEach((i) => { const a = m.get(i.categoryId) ?? []; a.push(i); m.set(i.categoryId, a); });
    m.forEach((a) => a.sort((x, y) => x.displayOrder - y.displayOrder));
    return m;
  }, [itemsQ.data]);

  const saveTheme = useMutation({
    mutationFn: () => api.patch<Restaurant>(`/api/restaurants/${rid}/theme`, { theme: CUSTOM_THEME, themeCustomJson: serializeCustomTheme(draft) }),
    onSuccess: (r) => {
      qc.setQueryData(['restaurant', rid], r);
      toast(t('saved'));
      setSavedJson(r.themeCustomJson ?? serializeCustomTheme(draft));
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  useEffect(() => {
    const r = restaurantQ.data;
    if (!r) return;
    // A café that saved under the old picker keeps whatever its document holds — including
    // the motif or card style it chose then, which still renders and simply has no control
    // here now. One that never configured anything starts on the default document.
    const nextDraft = r.themeCustomJson ? parseCustomTheme(r.themeCustomJson) : DEFAULT_CUSTOM_THEME;
    setDraft(nextDraft);
    setSavedJson(serializeCustomTheme(nextDraft));
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

  const resetDraft = async () => {
    const ok = await confirm({
      title: t('resetConfirmTitle'),
      message: t('resetConfirmMsg'),
      confirmLabel: t('resetLook'),
      cancelLabel: t('cancel'),
      danger: true,
    });
    if (!ok) return;
    setDraft(DEFAULT_CUSTOM_THEME);
  };

  return (
    <div className="tables-wrap look-page">
      <LookPanel
        draft={draft}
        saving={saveTheme.isPending}
        dirty={dirty}
        previewUrl={previewUrl}
        restaurant={restaurantQ.data}
        branch={branch}
        cats={cats}
        itemsByCat={itemsByCat}
        onPreview={openPreview}
        onChange={setDraft}
        onReset={resetDraft}
        onSave={() => saveTheme.mutate()}
        t={t}
      />
    </div>
  );
}

/* A miniature of each layout, drawn from the panel's own tokens so it reads under both
   dashboard skins and in RTL. Deliberately a drawing and not a screenshot: it has to stay
   truthful when the menu themes change. */
function LayoutThumb({ kind }: { kind: MenuLayoutKey }) {
  return (
    <svg className="look-layout-thumb" viewBox="0 0 64 48" aria-hidden="true" focusable="false">
      <rect x="0" y="0" width="64" height="48" rx="5" className="lt-bg" />
      {kind === 'list'
        ? [0, 1, 2].map((i) => (
            <g key={i} transform={`translate(7 ${7 + i * 12})`}>
              <rect width="9" height="9" rx="2" className="lt-photo" />
              <rect x="13" y="0.5" width="25" height="3" rx="1.5" className="lt-line" />
              <rect x="13" y="5.5" width="13" height="3" rx="1.5" className="lt-dim" />
            </g>
          ))
        : [0, 1].map((i) => (
            <g key={i} transform={`translate(7 ${6 + i * 19})`}>
              <rect width="50" height="11" rx="2" className="lt-photo" />
              <rect x="0" y="13" width="22" height="3" rx="1.5" className="lt-line" />
            </g>
          ))}
    </svg>
  );
}

function LookPanel({ draft, saving, dirty, previewUrl, restaurant, branch, cats, itemsByCat, onPreview, onChange, onReset, onSave, t }:
  {
    draft: MenuThemeCustom;
    saving: boolean;
    dirty: boolean;
    previewUrl: string | null;
    restaurant?: Restaurant;
    branch?: BranchResponse;
    cats: CategoryResponse[];
    itemsByCat: Map<number, MenuItemResponse[]>;
    onPreview: () => void;
    onChange: (custom: MenuThemeCustom) => void;
    onReset: () => void;
    onSave: () => void;
    t: (k: string) => string;
  }) {
  // How much of the live menu is actually photographed — the one fact that decides
  // whether Gallery is an upgrade or a downgrade for this cafe.
  const photoCoverage = useMemo(() => {
    let total = 0;
    let withPhoto = 0;
    itemsByCat.forEach((items) => items.forEach((i) => {
      if (!i.available) return;
      total += 1;
      if (i.imageUrl) withPhoto += 1;
    }));
    return { total, withPhoto, share: total === 0 ? 0 : withPhoto / total };
  }, [itemsByCat]);
  return (
    <div className="look-studio">
      {/* The stage is a fixed neutral canvas — it follows neither the dashboard theme nor
          the menu's own colours. Only the phone inside reflects those. */}
      <section className="look-stage">
        <LivePreview draft={draft} restaurant={restaurant} branch={branch} cats={cats} itemsByCat={itemsByCat} />
      </section>

      <section className="look-controls">
        {/* Five controls, each one field, each answered by the phone on the left. No named
            looks to choose between: "Sikka" and "Majlis" mean nothing to someone who owns a
            café, and a gallery of them is a quiz standing in front of the two colours they
            actually came here to set. */}
        <div className="look-control-block look-presets-block">
          <div className="look-control-title">{t('colorStudio')}</div>
          <div className="look-colors">
            {BASIC_COLOR_FIELDS.map((field) => (
              <label className="look-color" key={field.key}>
                <input
                  type="color"
                  value={basicColorOf(draft, field.key)}
                  aria-label={t(field.label)}
                  onChange={(e) => onChange(applyBasicColor(draft, field.key, e.target.value))}
                />
                <span className="look-color-chip" aria-hidden="true" style={{ background: basicColorOf(draft, field.key) }} />
                <span>{t(field.label)}</span>
              </label>
            ))}
          </div>
          <p className="look-note">{t('colorHint')}</p>
        </div>

        {/* Each font names itself in its own face: the only way to choose type is to see it,
            and the Arabic name is the specimen that matters on an Arabic menu. */}
        <div className="look-control-block">
          <div className="look-control-title">{t('fontLbl')}</div>
          <div className="look-font-row">
            {FONT_OPTIONS.map((f) => (
              <button className={'look-font' + (draft.font === f ? ' on' : '')} key={f}
                type="button" aria-pressed={draft.font === f}
                style={{ fontFamily: FONT_STACKS[f] }}
                onClick={() => onChange({ ...draft, font: f })}>
                {t('ft_' + f)}
              </button>
            ))}
          </div>
        </div>

        <div className="look-control-block">
          <div className="look-control-title">{t('cornersLbl')}</div>
          <div className="look-radius-row">
            {RADIUS_OPTIONS.map((r) => (
              <button className={'look-radius' + (draft.radius === r ? ' on' : '')} key={r}
                type="button" aria-pressed={draft.radius === r}
                onClick={() => onChange({ ...draft, radius: r })}>
                <span className={'look-radius-mark r-' + r} aria-hidden="true" />
                <b>{t('r_' + r)}</b>
              </button>
            ))}
          </div>
        </div>

        {/* Layout last of the four, because it is the one that changes the *shape* of the
            page rather than repainting it. Drawn as miniatures rather than listed by name —
            "list" and "gallery" mean nothing until you see the rows and the photos. */}
        <div className="look-control-block">
          <div className="look-control-title">{t('layoutLbl')}</div>
          <div className="look-layout-row">
            {LAYOUT_OPTIONS.map((lay) => (
              <button className={'look-layout-card' + (draft.layout === lay ? ' on' : '')} key={lay}
                type="button" aria-pressed={draft.layout === lay}
                onClick={() => onChange({ ...draft, layout: lay })}>
                <LayoutThumb kind={lay} />
                <b>{t('lay_' + lay)}</b>
                <small>{t('lay_' + lay + 'Hint')}</small>
              </button>
            ))}
          </div>
          {/* Gallery lives or dies on photography: an owner picking it with half the menu
              unshot gets a page of coloured initials. Say so here, with their real count,
              rather than letting them find out on a customer's phone. */}
          {draft.layout === 'gallery' && photoCoverage.total > 0 && (
            <p className={'look-layout-note' + (photoCoverage.share < GALLERY_PHOTO_FLOOR ? ' warn' : '')}>
              <b className="num">{photoCoverage.withPhoto}/{photoCoverage.total}</b> {t('galleryGate')}
              {photoCoverage.share < GALLERY_PHOTO_FLOOR && ' ' + t('galleryGateLow')}
            </p>
          )}
        </div>

        {/* Whether the café's note shows above the categories — a decision about this page,
            so the switch is here. The words themselves are a fact about the café and are
            written on the Café page; this block says so. */}
        <HouseCardToggle />

        <div className="look-savebar">
          {dirty && <span className="look-dirty-badge" role="status">{t('unsavedBadge')}</span>}
          <div className="look-actions">
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
function LivePreview({ draft, restaurant, branch, cats, itemsByCat }:
  { draft: MenuThemeCustom; restaurant?: Restaurant; branch?: BranchResponse; cats: CategoryResponse[]; itemsByCat: Map<number, MenuItemResponse[]> }) {
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

  const cafeName = nameOf(restaurant, lang) || t('lookTitle');

  // The house card, exactly as the real menu builds it: the note for THIS language plus the
  // fact chips read live off the profile. Flipping "Show the card" has to move something on
  // the phone or the switch is a claim the preview refuses to back up.
  const house = useMemo(() => parseMenuInfo(restaurant?.menuInfoJson), [restaurant?.menuInfoJson]);
  const houseNote = lang === 'ar' ? house.noteAr : house.noteEn;
  const facts = useMemo(() => houseFacts(branch, restaurant), [branch, restaurant]);
  // The real menu hides an empty card — nothing written, nothing to show. In the editor that
  // silence reads as a broken switch, so the preview says why instead, and where to fix it.
  const houseEmpty = house.show && !houseNote && facts.length === 0;

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
                  {house.show && !houseEmpty && (
                    <section className="c-house">
                      {houseNote && <p className="c-house-note">{houseNote}</p>}
                      {facts.length > 0 && (
                        /* Chips, never links: the real menu makes phone and Instagram
                           tappable, but a tel: or an outbound tab fired from inside the
                           dashboard preview would be an accident, not a preview. */
                        <div className="c-house-facts">
                          {facts.map((f) => (
                            <span className="c-fact" key={f.key}>
                              <span aria-hidden="true">{f.icon}</span>
                              {f.ltr ? <Ltr>{f.text}</Ltr> : <bdi>{f.text}</bdi>}
                            </span>
                          ))}
                        </div>
                      )}
                    </section>
                  )}
                  {houseEmpty && (
                    <section className="c-house look-house-empty">
                      <p className="c-house-note">{t('houseEmptyPreview')}</p>
                    </section>
                  )}
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
                                  {it.salePrice != null && <span className="c-off"><Ltr>−{discountPercent(it.price, it.salePrice)}%</Ltr></span>}
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
                        <span><span className="num"><Ltr>{l.qty}×</Ltr></span> {l.it.name}</span>
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

function ItemEditor({ rid, branchId, cats, item, defaultCat, onClose, onDone }:
  { rid: number; branchId?: number; cats: CategoryResponse[]; item: MenuItemResponse | null; defaultCat?: number; onClose: () => void; onDone: () => void }) {
  const t = useT(DICT); const toast = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  // The shelf's corner of the editor needs a branch to be per-branch about, and a person who
  // can see the shelf to pick from it. Without either it is simply not there, and a save
  // leaves whatever rules exist exactly alone.
  const shelfHere = branchId != null && can(user, 'STOCK');
  const [stockDraft, setStockDraft] = useState<StockDraft | null>(null);
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
      return item ? api.patch<MenuItemResponse>(`/api/menu/items/${item.id}`, body)
        : api.post<MenuItemResponse>('/api/menu/items', { restaurantId: rid, ...body });
    },
    onSuccess: async (saved) => {
      // The item is saved; now the shelf's answers, which needed its id. A draft that never
      // loaded is skipped, never sent empty.
      if (shelfHere && stockDraft) {
        try {
          await saveStockDraft(branchId!, saved.id, stockDraft);
          qc.invalidateQueries({ queryKey: ['menu-stock', branchId] });
          qc.invalidateQueries({ queryKey: ['recipes', branchId] });
          qc.invalidateQueries({ queryKey: ['stock-usage', branchId] });
        } catch (e) {
          toast(e instanceof ApiError ? e.message : 'Error');
          return;   // the item saved; the editor stays open so the rules can be retried
        }
      }
      onDone();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
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
                      ? <>{omr(discountSale)} {t('cur')}{f.discountType === 'PERCENT' && discountSale < priceNum && <span className="mitem-disc on"><Ltr>−{discountPercent(priceNum, discountSale)}%</Ltr></span>}</>
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

        {shelfHere && (
          <StockRules branchId={branchId!} menuItemId={item?.id ?? null} draft={stockDraft} onChange={setStockDraft} />
        )}

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
          <button className="btn ghost" onClick={onClose}>{t('cancel')}</button>
          <button className="btn" disabled={!valid || save.isPending || uploading} onClick={() => save.mutate()}>{t('save')}</button>
        </div>
      </div>
    </div>
  );
}
