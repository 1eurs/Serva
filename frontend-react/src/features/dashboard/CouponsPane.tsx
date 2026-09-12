import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useI18n, useT, Ltr, type Dict } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import { useConfirm } from '../../lib/confirm';
import { SettingsShell, PaneSection, Specimen } from './SettingsShell';
import { IconTicket } from '../customer/icons';
import type { Coupon, MenuItemResponse } from '../../lib/types';
import './coupons.css';

/**
 * The owner's coupon workshop.
 *
 * A coupon here is not a percentage off a bill — it is a list of items, each at its own percent
 * off, behind a code. That is the shape of what a café actually hands out ("your coffee is free,
 * 25% off food"), and it is also what makes a code safe to give to staff: it can only ever reach
 * the items the owner put on it, however it is typed at the counter.
 *
 * The code is generated rather than invented, because a code that is read off a screen and typed
 * one-handed at a till has requirements a person does not think about — no O/0, no I/1, short
 * enough to say out loud.
 */

/** The percents worth one tap. 100 is the whole point of the feature, so it leads. */
const QUICK_PERCENTS = [100, 50, 25, 10];

const DICT: Dict = {
  ar: {
    surface: 'طلب جديد · الكاشير',
    title: 'أكواد الخصم',
    sub: 'كود يكتبه الكاشير على الطلب. كل كود يحدد الأصناف المخفَّضة ونسبة كل صنف — 100% يعني مجاناً.',
    listTitle: 'أكوادك', listSub: 'الكود الموقوف يُرفض على الكاشير، وتبقى الطلبات القديمة كما هي.',
    newCoupon: 'كود جديد', noneYet: 'لا أكواد بعد.', noneYetSub: 'أنشئ كوداً وأعطه لفريقك.',
    on: 'يعمل', off: 'موقوف', itemsN: '{n} صنف',
    editTitle: 'الكود والاسم', editSub: 'الاسم هو ما يظهر على الفاتورة وشاشة الطلبات، فاجعله مفهوماً.',
    codeL: 'الكود', codeHint: 'يُكتب على الكاشير. الأحرف الكبيرة والصغيرة سواء.', regen: 'كود آخر',
    labelL: 'الاسم على الفاتورة', labelPh: 'مثال: وجبة الفريق',
    activeL: 'حالة الكود', activeOn: 'يعمل — يمكن استخدامه الآن', activeOff: 'موقوف — يُرفض على الكاشير',
    itemsTitle: 'الأصناف والنِسب', itemsSub: 'اختر ما يشمله الكود، وحدّد نسبة كل صنف. ما ليس في القائمة يُحسب بسعره الكامل.',
    covered: 'المشمولة', coveredNone: 'لم تختر أي صنف بعد — الكود بلا أصناف لا يخصم شيئاً.',
    addL: 'إضافة صنف', searchItems: 'ابحث عن صنف…', noMatches: 'لا توجد أصناف مطابقة',
    free: 'مجاناً', percentL: 'النسبة', remove: 'إزالة',
    save: 'حفظ', saved: 'تم الحفظ', created: 'تم إنشاء الكود', deleted: 'تم حذف الكود',
    del: 'حذف', cancel: 'إلغاء',
    delConfirm: 'سيمنع ذلك استخدام هذا الكود. الطلبات التي استخدمته تبقى كما هي. للإيقاف المؤقت استخدم "موقوف".',
    spec: 'ما تعطيه لفريقك', specHint: 'صوّر هذه البطاقة وأرسلها — فيها الكود وما يشمله.',
  },
  en: {
    surface: 'Order pad · the counter',
    title: 'Coupons',
    sub: 'A code your counter types on an order. Each coupon names the items it discounts and by how much — 100% hands the item over free.',
    listTitle: 'Your codes', listSub: 'A switched-off code is refused at the counter; the orders that already used it stay as they were.',
    newCoupon: 'New coupon', noneYet: 'No coupons yet.', noneYetSub: 'Make one and give the code to your team.',
    on: 'On', off: 'Off', itemsN: '{n} items',
    editTitle: 'Code and name', editSub: 'The name is what shows on the receipt and the order card, so make it something a customer would understand.',
    codeL: 'Code', codeHint: 'Typed at the counter. Upper and lower case are the same code.', regen: 'Another code',
    labelL: 'Name on the receipt', labelPh: 'e.g. Staff meal',
    activeL: 'Status', activeOn: 'On — can be used right now', activeOff: 'Off — refused at the counter',
    itemsTitle: 'Items and percents', itemsSub: 'Pick what the coupon covers and how much comes off each one. Anything not listed is charged in full.',
    covered: 'Covered', coveredNone: 'Nothing picked yet — a coupon with no items takes nothing off.',
    addL: 'Add an item', searchItems: 'Search items…', noMatches: 'No items match',
    free: 'Free', percentL: '% off', remove: 'Remove',
    save: 'Save', saved: 'Saved', created: 'Coupon created', deleted: 'Coupon deleted',
    del: 'Delete', cancel: 'Cancel',
    delConfirm: 'This stops the code working. Orders that already used it stay exactly as they were. To pause it instead, switch it Off.',
    spec: 'What you hand your team', specHint: 'Screenshot this and send it — the code and what it covers, in one card.',
  },
};

/** Which coupon the pane is editing: an existing id, a fresh unsaved one, or nothing. */
type Editing = { id: number | null } | null;

export default function CouponsPane() {
  const { user } = useAuth();
  const rid = user!.restaurantId!;
  const { lang } = useI18n();
  const t = useT(DICT);
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();

  const couponsQ = useQuery({ queryKey: ['coupons', rid], queryFn: () => api.get<Coupon[]>('/api/coupons') });
  const itemsQ = useQuery({
    queryKey: ['menu-items', rid],
    queryFn: () => api.get<MenuItemResponse[]>(`/api/menu/items?restaurantId=${rid}`),
  });

  const [editing, setEditing] = useState<Editing>(null);
  const [form, setForm] = useState({ code: '', label: '', active: true, items: {} as Record<number, number> });
  const [itemSearch, setItemSearch] = useState('');

  const coupons = couponsQ.data ?? [];
  const items = itemsQ.data ?? [];
  const itemName = (it: MenuItemResponse) => (lang === 'ar' ? (it.nameAr || it.nameEn) : (it.nameEn || it.nameAr));
  const nameOfId = (id: number) => {
    const it = items.find((i) => i.id === id);
    return it ? itemName(it) : `#${id}`;
  };

  const edit = (c: Coupon) => {
    setEditing({ id: c.id });
    setItemSearch('');
    setForm({
      code: c.code,
      label: c.label,
      active: c.active,
      items: Object.fromEntries(c.items.map((i) => [i.menuItemId, i.percentOff])),
    });
  };

  /* A new coupon opens with a code already in it, taken from the server so it is known not to
     clash. An owner asked to invent a code types STAFF, then STAFF2 once that is taken. */
  const startNew = useMutation({
    mutationFn: () => api.get<string>('/api/coupons/suggest'),
    onSuccess: (code) => {
      setEditing({ id: null });
      setItemSearch('');
      setForm({ code, label: '', active: true, items: {} });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });
  const regen = useMutation({
    mutationFn: () => api.get<string>('/api/coupons/suggest'),
    onSuccess: (code) => setForm((p) => ({ ...p, code })),
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  const body = () => ({
    code: form.code.trim(),
    label: form.label.trim(),
    active: form.active,
    items: Object.entries(form.items).map(([menuItemId, percentOff]) => ({ menuItemId: Number(menuItemId), percentOff })),
  });

  const save = useMutation({
    mutationFn: () => (editing?.id
      ? api.patch<Coupon>(`/api/coupons/${editing.id}`, body())
      : api.post<Coupon>('/api/coupons', body())),
    onSuccess: (c) => {
      toast(editing?.id ? t('saved') : t('created'));
      qc.invalidateQueries({ queryKey: ['coupons', rid] });
      setEditing({ id: c.id });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.del<void>(`/api/coupons/${id}`),
    onSuccess: () => {
      toast(t('deleted'));
      qc.invalidateQueries({ queryKey: ['coupons', rid] });
      setEditing(null);
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  // Editing a coupon that has just been deleted elsewhere should not leave a ghost form open.
  useEffect(() => {
    if (editing?.id && couponsQ.data && !couponsQ.data.some((c) => c.id === editing.id)) setEditing(null);
  }, [couponsQ.data, editing]);

  const setItem = (id: number, percent: number) =>
    setForm((p) => ({ ...p, items: { ...p.items, [id]: Math.max(1, Math.min(100, Math.round(percent) || 1)) } }));
  const dropItem = (id: number) =>
    setForm((p) => {
      const next = { ...p.items };
      delete next[id];
      return { ...p, items: next };
    });

  const coveredIds = useMemo(() => Object.keys(form.items).map(Number), [form.items]);
  const q = itemSearch.trim().toLowerCase();
  const addable = items
    .filter((it) => !(it.id in form.items))
    .filter((it) => !q || (it.nameEn || '').toLowerCase().includes(q) || (it.nameAr || '').includes(itemSearch.trim()));

  const canSave = !!form.code.trim() && !!form.label.trim() && coveredIds.length > 0 && !save.isPending;

  if (couponsQ.isLoading) {
    return <div className="tables-wrap"><div className="center"><div className="spinner" /></div></div>;
  }

  return (
    <SettingsShell
      mark={<IconTicket size={28} />}
      surface={t('surface')}
      title={t('title')}
      sub={t('sub')}
      actions={editing
        ? <button className="btn" disabled={!canSave} onClick={() => save.mutate()}>{t('save')}</button>
        : <button className="btn" disabled={startNew.isPending} onClick={() => startNew.mutate()}>＋ {t('newCoupon')}</button>}
      aside={editing ? (
        <Specimen label={t('spec')}>
          {/* The card an owner screenshots into the staff group: the code big enough to read off
              a phone, and underneath it exactly what it is good for. */}
          <div className="cpn-ticket">
            <div className="cpn-ticket-top">
              <span className="cpn-ticket-mark" aria-hidden="true"><IconTicket size={15} /></span>
              <span className={'cpn-ticket-state' + (form.active ? ' on' : '')}>{form.active ? t('on') : t('off')}</span>
            </div>
            <div className="cpn-ticket-code">{form.code ? <Ltr>{form.code}</Ltr> : '—'}</div>
            <div className="cpn-ticket-label">{form.label.trim() || t('labelPh')}</div>
            <div className="cpn-ticket-rip" aria-hidden="true" />
            <ul className="cpn-ticket-items">
              {coveredIds.length === 0 && <li className="cpn-ticket-empty">{t('coveredNone')}</li>}
              {coveredIds.map((id) => (
                <li key={id}>
                  <span className="nm">{nameOfId(id)}</span>
                  <span className={'pc' + (form.items[id] >= 100 ? ' free' : '')}>
                    {form.items[id] >= 100 ? t('free') : <Ltr>−{form.items[id]}%</Ltr>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="stg-spec-note">{t('specHint')}</p>
        </Specimen>
      ) : undefined}
    >
      <PaneSection no="01" title={t('listTitle')} sub={t('listSub')}>
        {coupons.length === 0 ? (
          <div className="cpn-none">
            <b>{t('noneYet')}</b>
            <span>{t('noneYetSub')}</span>
          </div>
        ) : (
          <div className="cpn-list">
            {coupons.map((c) => (
              <button type="button" key={c.id}
                className={'cpn-row' + (editing?.id === c.id ? ' on' : '') + (c.active ? '' : ' off')}
                onClick={() => edit(c)}>
                <span className="cpn-row-code"><Ltr>{c.code}</Ltr></span>
                <span className="cpn-row-label">{c.label}</span>
                <span className="cpn-row-items">{t('itemsN').replace('{n}', String(c.items.length))}</span>
                <span className={'cpn-row-state' + (c.active ? ' on' : '')}>{c.active ? t('on') : t('off')}</span>
              </button>
            ))}
          </div>
        )}
      </PaneSection>

      {editing && (
        <>
          <PaneSection no="02" title={t('editTitle')} sub={t('editSub')}>
            <div className="profile-fields">
              <label className="field">
                <span>{t('codeL')}</span>
                <div className="cpn-code-row">
                  <input className="cpn-code" value={form.code} maxLength={24}
                    onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))} />
                  <button type="button" className="btn ghost" disabled={regen.isPending} onClick={() => regen.mutate()}>
                    ↻ {t('regen')}
                  </button>
                </div>
                <small className="cpn-hint">{t('codeHint')}</small>
              </label>
              <label className="field">
                <span>{t('labelL')}</span>
                <input value={form.label} placeholder={t('labelPh')} maxLength={80}
                  onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))} />
              </label>
            </div>
            {/* The same switch row the Café and Receipt panes use, rather than a control of its
                own: it is the pane's one on/off, and it already carries both skins, the coarse-
                pointer sizing and the shell's focus ring. */}
            <div className="profile-settings">
              <div className="profile-setting cpn-status">
                <div>
                  <b>{form.active ? t('on') : t('off')}</b>
                  <span>{form.active ? t('activeOn') : t('activeOff')}</span>
                </div>
                <button type="button" className={'switch' + (form.active ? ' on' : '')} role="switch"
                  aria-checked={form.active} aria-label={t('activeL')}
                  onClick={() => setForm((p) => ({ ...p, active: !p.active }))}><span /></button>
              </div>
            </div>
          </PaneSection>

          <PaneSection no="03" title={t('itemsTitle')} sub={t('itemsSub')}>
            <div className="field">
              <span>{t('covered')}</span>
              {coveredIds.length === 0 ? (
                <small className="cpn-hint">{t('coveredNone')}</small>
              ) : (
                <div className="cpn-covered">
                  {coveredIds.map((id) => (
                    <div className="cpn-cov" key={id}>
                      <span className="cpn-cov-nm">{nameOfId(id)}</span>
                      <div className="cpn-quick">
                        {QUICK_PERCENTS.map((pc) => (
                          <button type="button" key={pc}
                            className={'cpn-pc' + (form.items[id] === pc ? ' on' : '') + (pc === 100 ? ' free' : '')}
                            onClick={() => setItem(id, pc)}>
                            {pc === 100 ? t('free') : `${pc}%`}
                          </button>
                        ))}
                        <label className="cpn-pc-field">
                          <input className="cpn-pc-num num" type="number" min="1" max="100"
                            aria-label={t('percentL')} value={form.items[id]}
                            onChange={(e) => setItem(id, Number(e.target.value))} />
                          <span aria-hidden="true">%</span>
                        </label>
                      </div>
                      <button type="button" className="cpn-cov-x" title={t('remove')} aria-label={t('remove')}
                        onClick={() => dropItem(id)}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="field">
              <span>{t('addL')}</span>
              <input value={itemSearch} placeholder={t('searchItems')} onChange={(e) => setItemSearch(e.target.value)} />
              <div className="cpn-add-list">
                {addable.map((it) => (
                  <button type="button" key={it.id} className="cpn-add-row" onClick={() => setItem(it.id, 100)}>
                    <span className="nm">{itemName(it)}</span>
                    <span className="pr num">{it.price.toFixed(3)}</span>
                    <span className="add" aria-hidden="true">＋</span>
                  </button>
                ))}
                {addable.length === 0 && <p className="cpn-no-match">{t('noMatches')}</p>}
              </div>
            </div>

            {editing.id && (
              <div className="cpn-danger">
                <button type="button" className="btn danger" disabled={remove.isPending} onClick={async () => {
                  if (!await confirm({
                    danger: true, title: t('del'), message: t('delConfirm'),
                    confirmLabel: t('del'), cancelLabel: t('cancel'),
                  })) return;
                  remove.mutate(editing.id!);
                }}>{t('del')}</button>
              </div>
            )}
          </PaneSection>
        </>
      )}
    </SettingsShell>
  );
}
