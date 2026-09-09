import { useEffect, useState, type CSSProperties } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useI18n, useT, nameOf, type Dict } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import { useConfirm } from '../../lib/confirm';
import { useFeatures, isPlanRequiredError } from '../../lib/plan';
import type { LoyaltyProgram, MenuItemResponse, Restaurant } from '../../lib/types';
import { StampCard } from '../customer/StampCard';
import { MOTIF_OPTIONS, motifDataUrl, resolveMenuSkin } from '../customer/menuThemes';
import '../customer/loyalty.css';
import '../customer/menu-themes.css';

/** Curated card accents (mirrors the menu-theme palette family). */
const CARD_COLORS = ['#C8862B', '#FF7AA2', '#2FBF71', '#E2674A', '#D4AF6C', '#32D6C8', '#E31B3F', '#227D9A'];
/** Curated card backgrounds — a few dark and a few light paper tones. */
const CARD_BGS = ['#15181D', '#221A14', '#10251E', '#0B1024', '#3A1024', '#FFF9F0', '#FBF5EC', '#FFF1F4'];
const STAMP_ICONS = ['★', '☕', '🧋', '🥐', '🍩', '🧁', '🍪', '🍰', '🍫', '❤️', '⚡', '🌙', '🌸', '👑'];
const CARD_MOTIFS = MOTIF_OPTIONS.filter((m) => m !== 'none');
const FALLBACK_ACCENT = '#c79a54'; // the card's default accent (loyalty.css fallback)

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

const DICT: Dict = {
  ar: {
    sub: 'كافئ العملاء تلقائياً: ختم مع كل طلب، ومكافأة عند اكتمال البطاقة.',
    rewardTitle: 'تفاصيل المكافأة', rewardSub: 'اختر الأصناف المجانية والنص الذي يظهر للعميل — يستبدل العميل مكافأته بصنف واحد منها.',
    rulesTitle: 'قواعد جمع الأختام', rulesSub: 'حدّد عدد الطلبات والحد الأدنى المؤهّل.',
    preview: 'معاينة بطاقة العميل', previewEmpty: 'مكافأتك القادمة',
    proTitle: 'الولاء ليس ضمن باقتك', proSub: 'رقِّ باقتك لتشغيل بطاقة الأختام ومكافأة العملاء.',
    program: 'بطاقة الأختام', on: 'مُفعّل', off: 'متوقّف',
    onSub: 'يحصل العملاء على ختم مع كل طلب مؤهّل', offSub: 'الولاء متوقّف — لا يمكن جمع الأختام أو استبدالها',
    turnOn: 'تفعيل', turnOff: 'إيقاف',
    cancel: 'إلغاء', offConfirm: 'سيوقف ذلك جمع العملاء للأختام واستبدال المكافآت. يمكنك إعادة التفعيل في أي وقت.',
    rewardItems: 'الأصناف المجانية', rewardItemsHint: 'يختار العميل صنفاً واحداً من هذه القائمة عند استبدال مكافأته.',
    searchItems: 'ابحث عن صنف…', noMatches: 'لا توجد أصناف مطابقة',
    stamps: 'عدد الأختام', rewardLabel: 'نص المكافأة للعميل', rewardLabelPh: 'مثال: مشروبك التاسع علينا ☕',
    suggestL: 'أفكار — اضغط للاستخدام:',
    minOrder: 'الحد الأدنى للطلب لكسب ختم (اختياري)',
    minOrderHint: 'لا تُحتسب الأختام للطلبات أقل من هذا المبلغ. اتركه فارغاً بلا حدّ.',
    ruleHint: 'يحصل العميل على الصنف المجاني بعد كل', orders: 'طلبات.',
    lookTitle: 'شكل البطاقة', lookSub: 'اجعل البطاقة بهويتك — لون وختم ونقشة. يراها العميل في كل مكان.',
    cardColorL: 'لون البطاقة', cardBgL: 'خلفية البطاقة', colorAuto: 'حسب ثيم القائمة', customColor: 'لون مخصص',
    colorAutoHint: 'بدون لون مخصص، تتبع البطاقة ثيم قائمتك تلقائياً. المعاينة تعرض ثيم قائمتك الحالي.',
    stampIconL: 'أيقونة الختم', motifL: 'نقشة البطاقة', motifNone: 'بدون',
    stateCollecting: 'جمع الأختام', stateReady: 'المكافأة جاهزة',
    save: 'حفظ التغييرات', saved: 'تم الحفظ', proNeeded: 'هذه الميزة ليست ضمن باقتك.',
  },
  en: {
    sub: 'Reward customers automatically: a stamp on every order, a reward when the card is full.',
    rewardTitle: 'Reward details', rewardSub: 'Choose the items customers can claim free (they pick one) and the message they will see.',
    rulesTitle: 'Earning rules', rulesSub: 'Set the number of orders and optional qualifying total.',
    preview: 'Customer card preview', previewEmpty: 'Your next reward',
    proTitle: 'Loyalty is not part of your plan', proSub: 'Upgrade your plan to run a stamp card and reward your regulars.',
    program: 'Stamp card', on: 'Enabled', off: 'Disabled',
    onSub: 'Customers earn a stamp on every qualifying order', offSub: 'Loyalty is paused — stamps cannot be earned or redeemed',
    turnOn: 'Turn on', turnOff: 'Turn off',
    cancel: 'Cancel', offConfirm: 'This will stop customers from earning stamps and redeeming rewards. You can turn it back on anytime.',
    rewardItems: 'Free reward items', rewardItemsHint: 'Customers pick ONE of these items free when they redeem a full card.',
    searchItems: 'Search items…', noMatches: 'No items match',
    stamps: 'Stamps to earn it', rewardLabel: 'Reward text shown to customers', rewardLabelPh: 'e.g. Your 9th drink is on us ☕',
    suggestL: 'Ideas — tap to use:',
    minOrder: 'Minimum order to earn a stamp (optional)',
    minOrderHint: 'Orders below this total will not earn a stamp. Leave empty for no limit.',
    ruleHint: 'Customers get the free item after every', orders: 'orders.',
    lookTitle: 'Card look', lookSub: 'Make the card yours — color, stamp icon and pattern. Customers see it on every card and strip.',
    cardColorL: 'Card color', cardBgL: 'Card background', colorAuto: 'Menu theme', customColor: 'Custom color',
    colorAutoHint: 'Without custom colors the card follows your menu theme automatically. The preview shows your current menu theme.',
    stampIconL: 'Stamp icon', motifL: 'Card pattern', motifNone: 'None',
    stateCollecting: 'Collecting', stateReady: 'Reward ready',
    save: 'Save changes', saved: 'Saved', proNeeded: 'This feature is not part of your plan.',
  },
};

export default function LoyaltySetup() {
  const { user } = useAuth();
  const rid = user!.restaurantId!;
  const { lang } = useI18n();
  const t = useT(DICT);
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();

  const restaurantQ = useQuery({ queryKey: ['restaurant', rid], queryFn: () => api.get<Restaurant>(`/api/restaurants/${rid}`) });
  const features = useFeatures();
  const pro = features.has('LOYALTY');

  const programQ = useQuery({ queryKey: ['loyalty-program', rid], queryFn: () => api.get<LoyaltyProgram>('/api/loyalty/program'), enabled: pro });
  const itemsQ = useQuery({ queryKey: ['menu-items', rid], queryFn: () => api.get<MenuItemResponse[]>(`/api/menu/items?restaurantId=${rid}`), enabled: pro });

  const [form, setForm] = useState({
    enabled: false, stampsRequired: '8', rewardLabel: '', rewardItemIds: [] as number[], minOrderAmount: '',
    cardColor: '', cardBg: '', stampIcon: '★', cardMotif: '',
  });
  const set = (k: keyof typeof form, v: string | boolean | number[]) => setForm((p) => ({ ...p, [k]: v }));
  const [itemSearch, setItemSearch] = useState('');
  const [previewReady, setPreviewReady] = useState(false);
  useEffect(() => {
    const p = programQ.data;
    if (!p) return;
    setForm({
      enabled: p.enabled,
      stampsRequired: String(p.stampsRequired || 8),
      rewardLabel: p.rewardLabel ?? '',
      rewardItemIds: p.rewardItemIds ?? [],
      minOrderAmount: p.minOrderAmount != null ? String(p.minOrderAmount) : '',
      cardColor: p.cardColor ?? '',
      cardBg: p.cardBg ?? '',
      stampIcon: p.stampIcon || '★',
      cardMotif: p.cardMotif ?? '',
    });
  }, [programQ.data]);

  const save = useMutation({
    mutationFn: () => api.patch<LoyaltyProgram>('/api/loyalty/program', {
      enabled: form.enabled,
      stampsRequired: Number(form.stampsRequired) || 1,
      rewardLabel: form.rewardLabel.trim(),
      rewardItemIds: form.rewardItemIds,
      minOrderAmount: form.minOrderAmount.trim() ? Number(form.minOrderAmount) : null,
      cardColor: form.cardColor || null,
      cardBg: form.cardBg || null,
      stampIcon: form.stampIcon.trim() || '★',
      cardMotif: form.cardMotif || null,
    }),
    onSuccess: (p) => { qc.setQueryData(['loyalty-program', rid], p); toast(t('saved')); },
    onError: (e) => toast(isPlanRequiredError(e) ? t('proNeeded') : (e instanceof ApiError ? e.message : 'Error')),
  });

  const items = itemsQ.data ?? [];
  const itemName = (it: MenuItemResponse) => (lang === 'ar' ? (it.nameAr || it.nameEn) : (it.nameEn || it.nameAr));
  const toggleItem = (id: number) => set('rewardItemIds', form.rewardItemIds.includes(id)
    ? form.rewardItemIds.filter((x) => x !== id) : [...form.rewardItemIds, id]);
  const q = itemSearch.trim().toLowerCase();
  const shownItems = q
    ? items.filter((it) => (it.nameEn || '').toLowerCase().includes(q) || (it.nameAr || '').includes(itemSearch.trim()))
    : items;
  const selectedNames = form.rewardItemIds
    .map((id) => { const it = items.find((i) => i.id === id); return it ? itemName(it) : null; })
    .filter((n): n is string => !!n);
  const canSave = !!form.rewardLabel.trim() && (!form.enabled || form.rewardItemIds.length > 0);
  const stampCount = Math.max(1, Math.min(12, Number(form.stampsRequired) || 1));
  // Preview inside the café's real menu skin, so the card is seen exactly as customers will.
  const previewSkin = resolveMenuSkin(restaurantQ.data?.theme, restaurantQ.data?.themeCustomJson);
  const ruleN = Math.max(1, Number(form.stampsRequired) || 1);

  // Tap-to-use reward text ideas, built from the program itself.
  const firstItem = selectedNames[0];
  const suggestions = lang === 'ar'
    ? [
        `مشروبك رقم ${ruleN + 1} علينا ☕`,
        firstItem ? `${firstItem} مجاناً عند اكتمال بطاقتك ⭐` : 'مكافأة مجانية عند اكتمال بطاقتك ⭐',
        `اجمع ${ruleN} أختام ودلّل نفسك 🎁`,
        'على حسابنا — اختر ما يحلو لك! 🎉',
      ]
    : [
        `Your ${ordinal(ruleN + 1)} drink is on us ☕`,
        firstItem ? `Free ${firstItem} when your card is full ⭐` : 'A free treat when your card is full ⭐',
        `Collect ${ruleN} stamps — treat yourself 🎁`,
        'On the house — pick your favorite! 🎉',
      ];

  if (restaurantQ.isLoading || !features.ready) {
    return <div className="tables-wrap"><div className="center"><div className="spinner" /></div></div>;
  }
  if (!pro) {
    return (
      <div className="tables-wrap">
        <div className="empty" style={{ marginTop: 56 }}>
          <div className="big">🎟️</div>
          <h3>{t('proTitle')}</h3>
          <p>{t('proSub')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tables-wrap loy-page loy-setup-page">
      <div className="loy-setup-frame">
        <header className="loy-setup-hero">
          <div className="loy-setup-identity">
            <div className="loy-ticket-mark" aria-hidden="true">🎟</div>
            <div>
              <div className={'loy-program-state' + (form.enabled ? ' on' : '')}><span />{form.enabled ? t('on') : t('off')}</div>
              <h3>{t('program')}</h3>
              <p>{t('sub')}</p>
            </div>
          </div>
          <button className="btn" disabled={!canSave || save.isPending} onClick={() => save.mutate()}>{t('save')}</button>
        </header>

        <div className="loy-setup-layout">
          <main className="loy-setup-main">
            <section className="loy-config-section">
              <div className="loy-config-head">
                <span>01</span>
                <div><h4>{t('rewardTitle')}</h4><p>{t('rewardSub')}</p></div>
              </div>
              <div className="loy-config-fields">
                <div className="field loy-reward-item">
                  <span>{t('rewardItems')}</span>
                  {form.rewardItemIds.length > 0 && (
                    <div className="loy-chips">
                      {form.rewardItemIds.map((id) => {
                        const it = items.find((i) => i.id === id);
                        return (
                          <button type="button" key={id} className="loy-chip" onClick={() => toggleItem(id)}>
                            {it ? itemName(it) : `#${id}`}<i aria-hidden="true">×</i>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <input value={itemSearch} placeholder={t('searchItems')} onChange={(e) => setItemSearch(e.target.value)} />
                  <div className="loy-item-list">
                    {shownItems.map((it) => (
                      <label key={it.id} className={'loy-item-row' + (form.rewardItemIds.includes(it.id) ? ' sel' : '')}>
                        <input type="checkbox" checked={form.rewardItemIds.includes(it.id)} onChange={() => toggleItem(it.id)} />
                        <span className="nm">{itemName(it)}</span>
                        <span className="pr num">{it.price.toFixed(3)}</span>
                      </label>
                    ))}
                    {shownItems.length === 0 && <p className="loy-no-match">{t('noMatches')}</p>}
                  </div>
                  <small className="loy-hint">{t('rewardItemsHint')}</small>
                </div>
                <div className="field loy-reward-item">
                  <span>{t('rewardLabel')}</span>
                  <input value={form.rewardLabel} placeholder={t('rewardLabelPh')} maxLength={120} onChange={(e) => set('rewardLabel', e.target.value)} />
                  <div className="loy-suggest">
                    <small>{t('suggestL')}</small>
                    {suggestions.map((s) => (
                      <button type="button" key={s} onClick={() => set('rewardLabel', s)}>{s}</button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="loy-config-section">
              <div className="loy-config-head">
                <span>02</span>
                <div><h4>{t('rulesTitle')}</h4><p>{t('rulesSub')}</p></div>
              </div>
              <div className="loy-config-fields">
                <label className="field">
                  <span>{t('stamps')}</span>
                  <input className="num" type="number" min="1" max="50" value={form.stampsRequired} onChange={(e) => set('stampsRequired', e.target.value)} />
                </label>
                <label className="field">
                  <span>{t('minOrder')}</span>
                  <input className="num" type="number" min="0" step="0.001" value={form.minOrderAmount} onChange={(e) => set('minOrderAmount', e.target.value)} />
                  <small className="loy-hint">{t('minOrderHint')}</small>
                </label>
              </div>
              <p className="loy-rule">{t('ruleHint')} <b className="num">{ruleN}</b> {t('orders')}</p>
            </section>

            <section className="loy-config-section">
              <div className="loy-config-head">
                <span>03</span>
                <div><h4>{t('lookTitle')}</h4><p>{t('lookSub')}</p></div>
              </div>
              <div className="loy-config-fields">
                <div className="field loy-reward-item">
                  <span>{t('cardColorL')}</span>
                  <div className="loy-swatches">
                    <button type="button" className={'loy-swatch auto' + (!form.cardColor ? ' on' : '')}
                      title={t('colorAuto')} aria-label={t('colorAuto')} onClick={() => set('cardColor', '')} />
                    {CARD_COLORS.map((c) => (
                      <button type="button" key={c} className={'loy-swatch' + (form.cardColor === c ? ' on' : '')}
                        style={{ background: c }} aria-label={c} onClick={() => set('cardColor', c)} />
                    ))}
                    <label className={'loy-swatch custom' + (form.cardColor && !CARD_COLORS.includes(form.cardColor) ? ' on' : '')}
                      title={t('customColor')}>
                      <input type="color" value={form.cardColor || FALLBACK_ACCENT}
                        onChange={(e) => set('cardColor', e.target.value.toUpperCase())} />
                      <span aria-hidden="true">🎨</span>
                    </label>
                  </div>
                  <small className="loy-hint">{t('colorAutoHint')}</small>
                </div>
                <div className="field loy-reward-item">
                  <span>{t('cardBgL')}</span>
                  <div className="loy-swatches">
                    <button type="button" className={'loy-swatch auto' + (!form.cardBg ? ' on' : '')}
                      title={t('colorAuto')} aria-label={t('colorAuto')} onClick={() => set('cardBg', '')} />
                    {CARD_BGS.map((c) => (
                      <button type="button" key={c} className={'loy-swatch' + (form.cardBg === c ? ' on' : '')}
                        style={{ background: c }} aria-label={c} onClick={() => set('cardBg', c)} />
                    ))}
                    <label className={'loy-swatch custom' + (form.cardBg && !CARD_BGS.includes(form.cardBg) ? ' on' : '')}
                      title={t('customColor')}>
                      <input type="color" value={form.cardBg || '#15181D'}
                        onChange={(e) => set('cardBg', e.target.value.toUpperCase())} />
                      <span aria-hidden="true">🎨</span>
                    </label>
                  </div>
                </div>
                <div className="field loy-reward-item">
                  <span>{t('stampIconL')}</span>
                  <div className="loy-icon-row">
                    {STAMP_ICONS.map((ic) => (
                      <button type="button" key={ic} className={'loy-icon-opt' + (form.stampIcon === ic ? ' on' : '')}
                        onClick={() => set('stampIcon', ic)}>{ic}</button>
                    ))}
                    <input className="loy-icon-free" value={form.stampIcon} maxLength={8} aria-label={t('stampIconL')}
                      onChange={(e) => set('stampIcon', e.target.value)} />
                  </div>
                </div>
                <div className="field loy-reward-item">
                  <span>{t('motifL')}</span>
                  <div className="loy-motif-row">
                    <button type="button" className={'loy-motif-opt none' + (!form.cardMotif ? ' on' : '')}
                      onClick={() => set('cardMotif', '')}>{t('motifNone')}</button>
                    {CARD_MOTIFS.map((m) => (
                      <button type="button" key={m} className={'loy-motif-opt' + (form.cardMotif === m ? ' on' : '')}
                        title={m} aria-label={m} onClick={() => set('cardMotif', m)}
                        style={{ backgroundImage: motifDataUrl(m, form.cardColor || FALLBACK_ACCENT, 0.3) }} />
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </main>

          <aside className="loy-setup-aside">
            <button type="button" className={'loy-status ' + (form.enabled ? 'on' : 'off')}
              role="switch" aria-checked={form.enabled} onClick={async () => {
                if (form.enabled && !await confirm({
                  danger: true, title: t('turnOff'), message: t('offConfirm'),
                  confirmLabel: t('turnOff'), cancelLabel: t('cancel'),
                })) return;
                set('enabled', !form.enabled);
              }}>
              <span className="loy-status-dot" aria-hidden="true" />
              <span className="loy-status-main">
                <b>{form.enabled ? t('on') : t('off')}</b>
                <span>{form.enabled ? t('onSub') : t('offSub')}</span>
              </span>
              <span className="loy-status-act">{form.enabled ? t('turnOff') : t('turnOn')}</span>
            </button>

            <section className="loy-card-preview">
              <span className="loy-preview-label">{t('preview')}</span>
              <div className="loy-preview-state" role="tablist" aria-label={t('preview')}>
                <button type="button" className={previewReady ? '' : 'on'} onClick={() => setPreviewReady(false)}>{t('stateCollecting')}</button>
                <button type="button" className={previewReady ? 'on' : ''} onClick={() => setPreviewReady(true)}>{t('stateReady')}</button>
              </div>
              <div className="cust-bg loy-preview-live" data-menu-theme={previewSkin.themeId}
                {...(previewSkin.attrs ?? {})} style={previewSkin.style as CSSProperties | undefined}>
                <StampCard sample
                  name={nameOf(restaurantQ.data, lang) || 'Serva'}
                  logoUrl={restaurantQ.data?.logoUrl}
                  rewardLabel={form.rewardLabel.trim() || t('previewEmpty')}
                  rewardItemNames={selectedNames}
                  stamps={previewReady ? stampCount : Math.max(1, Math.min(stampCount - 1, Math.ceil(stampCount * 0.6)))}
                  stampsRequired={stampCount}
                  availableRewards={previewReady ? 1 : 0}
                  cardColor={form.cardColor || undefined}
                  cardBg={form.cardBg || undefined}
                  stampIcon={form.stampIcon}
                  cardMotif={form.cardMotif || undefined} />
              </div>
              <p className="loy-rule">{t('ruleHint')} <b className="num">{ruleN}</b> {t('orders')}</p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
