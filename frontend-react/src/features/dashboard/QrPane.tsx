import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, upload, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useI18n, useT, nameOf, type Dict } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import { ensureGoogleFonts } from '../../lib/fonts';
import { useFeatures } from '../../lib/plan';
import { SettingsShell, PaneSection, Specimen } from './SettingsShell';
import {
  BrandedQrCode, loadQrStyle, saveQrStyle, randomQrStyle, resolveQrStyle, qrBadgeSourceOf, qrHex,
  DEFAULT_QR_STYLE, QR_PRESETS, QR_PALETTE, QR_INK, QR_INK_IDS,
  QR_DOT_IDS, QR_EYE_IDS, QR_BADGE_SHAPE_IDS, QR_FONT_IDS, QR_FONT_STACK, QR_FONT_GOOGLE,
  type QrBadgeStyle,
} from './qrStyle';
import type { Restaurant } from '../../lib/types';

const DICT: Dict = {
  ar: {
    surface: 'رموز الطاولات المطبوعة', title: 'شكل رمز QR',
    sub: 'الألوان والشكل والشعار في وسط الرمز الذي يمسحه عميلك. المعاينة على اليمين كما سيُطبع.',
    spec: 'كما يُطبع', specNote: 'أبيض دائماً خلف الرمز — هذا ما يجعله يُمسح بسرعة. اطبع صفحة تجريبية وامسحها بعد أي تعديل كبير.',
    secPreset: 'ابدأ من قالب', secPresetSub: 'ستة قوالب جاهزة. اختر واحداً ثم عدّل ما تشاء تحته.',
    secCenter: 'وسط الرمز', secCenterSub: 'ما يظهر في المربّع الأوسط: اسم المقهى أو شعار.',
    secColor: 'الألوان', secColorSub: 'الحبر هو لون المربعات، والشارة لون الوسط. الورق أبيض دائماً.',
    secShape: 'الأشكال', secShapeSub: 'شكل النقاط وزوايا التعريف والإطار حول الوسط.',
    secType: 'الخط', secTypeSub: 'خط اسم المقهى في الوسط — يظهر فقط بدون شعار.',
    presets: 'قوالب جاهزة', ink: 'الحبر', color: 'شارة', dots: 'النقاط', eyes: 'الزوايا',
    badgeShape: 'شكل الشارة', font: 'الخط',
    shuffle: 'خلط سريع', reset: 'الأصل',
    logoNone: 'اسم المقهى', logoCafe: 'شعار المقهى', logoCustom: 'صورة أخرى',
    logoUpload: 'رفع صورة', logoReplace: 'تغيير الصورة', uploading: 'جارٍ الرفع…',
    logoCafeHint: 'شعار المقهى مأخوذ من صفحة «المقهى» — إن غيّرته هناك تتغيّر الرموز معه.',
    logoNoCafeHint: 'لم ترفع شعاراً للمقهى بعد. ارفعه في إعدادات ← المقهى ليظهر هنا كخيار.',
    hint: 'الشعار هنا لرموز QR فقط ولا يغيّر شعار المقهى. اطبع بعد التعديل لتجربة المسح.',
    secLocked: 'تخصيص رمز QR', secLockedSub: 'الرمز يعمل كما هو — هذا يغيّر شكله فقط.',
    proSoon: 'تخصيص QR سيكون متاحاً في باقة أعلى قريباً. رموزك الحالية تُمسح بشكلها الأصلي.',
    dot_soft: 'ناعم', dot_square: 'مربّع', dot_dots: 'دوائر', dot_diamond: 'معين',
    eye_square: 'حاد', eye_rounded: 'مدوّر', eye_circle: 'دائري',
    badge_brutal: 'نيوبروتال', badge_flat: 'مسطّح', badge_pill: 'كبسولة', badge_round: 'دائري',
    preset_serva: 'Serva', preset_espresso: 'إسبريسو', preset_ocean: 'محيط', preset_sunset: 'غروب', preset_mono: 'أبيض وأسود', preset_candy: 'حلوى',
    ft_bricolage: 'Bricolage', ft_tajawal: 'تجوّال', ft_markazi: 'مركزي', ft_elmessiri: 'المسيري', ft_reemkufi: 'ريم كوفي', ft_sora: 'Sora',
  },
  en: {
    surface: 'Printed table codes', title: 'QR code look',
    sub: 'The colors, shape and center mark on the code your customer scans. The stage shows it as it prints.',
    spec: 'As it prints', specNote: 'The paper behind the code stays white — that is what keeps it scanning fast. Print one and scan it after any big change.',
    secPreset: 'Start from a preset', secPresetSub: 'Six ready-made looks. Pick one, then change anything below it.',
    secCenter: 'Center of the code', secCenterSub: 'What sits in the middle square: the café name, or a logo.',
    secColor: 'Colors', secColorSub: 'Ink is the modules, badge is the middle. Paper is always white.',
    secShape: 'Shapes', secShapeSub: 'The module shape, the three corner eyes, and the frame around the middle.',
    secType: 'Type', secTypeSub: 'The face the café name is set in — only shows when there is no logo.',
    presets: 'Presets', ink: 'Ink', color: 'Badge', dots: 'Modules', eyes: 'Corners',
    badgeShape: 'Badge shape', font: 'Font',
    shuffle: 'Quick mix', reset: 'Reset',
    logoNone: 'Café name', logoCafe: 'Café logo', logoCustom: 'Another image',
    logoUpload: 'Upload an image', logoReplace: 'Replace image', uploading: 'Uploading…',
    logoCafeHint: 'This is the logo from your Café page — change it there and the codes follow.',
    logoNoCafeHint: 'No café logo yet. Upload one under Settings → Café and it shows up here as an option.',
    hint: 'A logo here is QR-only and never changes your café logo. Print and scan to double-check.',
    secLocked: 'Customizing the code', secLockedSub: 'The code already works — this only changes how it looks.',
    proSoon: 'QR customization will be a paid upgrade soon. Your codes keep scanning in the default look.',
    dot_soft: 'Soft', dot_square: 'Square', dot_dots: 'Dots', dot_diamond: 'Diamond',
    eye_square: 'Sharp', eye_rounded: 'Rounded', eye_circle: 'Circle',
    badge_brutal: 'Brutal', badge_flat: 'Flat', badge_pill: 'Pill', badge_round: 'Round',
    preset_serva: 'Serva', preset_espresso: 'Espresso', preset_ocean: 'Ocean', preset_sunset: 'Sunset', preset_mono: 'Mono', preset_candy: 'Candy',
    ft_bricolage: 'Bricolage', ft_tajawal: 'Tajawal', ft_markazi: 'Markazi', ft_elmessiri: 'El Messiri', ft_reemkufi: 'Reem Kufi', ft_sora: 'Sora',
  },
};

/** The link a preview code points at — a real branch URL when we have one, so the specimen
 *  on screen is the same length of payload (and therefore the same density) as the real thing. */
const previewUrlOf = (slug: string | undefined, branchId?: number) =>
  `${window.location.origin}/r/${slug || 'demo'}/b/${branchId || 1}/car`;

/**
 * The QR studio.
 *
 * It used to sit on top of the Tables page, which put a full design tool in the way of the
 * one screen staff open to print a code. Every other customization is a Settings pane, so
 * this is one too — Tables now only draws with what is chosen here.
 */
export default function QrPane({ branchId }: { branchId?: number }) {
  const t = useT(DICT);
  const { lang } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const [style, setStyle] = useState<QrBadgeStyle>(() => loadQrStyle(user?.restaurantId));
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: restaurant } = useQuery({
    queryKey: ['restaurant', user?.restaurantId],
    queryFn: () => api.get<Restaurant>(`/api/restaurants/${user!.restaurantId}`),
    enabled: !!user?.restaurantId,
  });

  useEffect(() => { setStyle(loadQrStyle(user?.restaurantId)); }, [user?.restaurantId]);
  useEffect(() => {
    const specs = QR_FONT_GOOGLE[style.fontId];
    if (specs) ensureGoogleFonts(specs);
  }, [style.fontId]);

  // The style never leaves the browser, so the gate is enforced wherever it is read.
  // The answer is the server's: whether the tier includes QR_CUSTOMIZATION on the Plans grid.
  const features = useFeatures();
  const qrCustom = features.has('QR_CUSTOMIZATION');

  const cafeLogo = restaurant?.logoUrl?.trim() || null;
  const cafeName = nameOf(restaurant, lang).trim();
  const previewValue = previewUrlOf(restaurant?.slug, branchId);
  const effective = qrCustom ? resolveQrStyle(style, cafeLogo) : { ...DEFAULT_QR_STYLE };
  const hasBadgeImage = !!effective.badgeImageUrl;

  const commit = (next: QrBadgeStyle) => {
    if (!qrCustom) return;
    setStyle(next);
    saveQrStyle(user?.restaurantId, next);
  };
  const patch = (partial: Partial<QrBadgeStyle>) => commit({ ...style, ...partial });

  const source = qrBadgeSourceOf(style);
  // The upload survives a trip through the other two tiles — only the source changes, so
  // coming back to "another image" finds the file still there instead of an empty slot.
  const customThumb = style.badgeImageUrl?.trim() || null;

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !qrCustom) return;
    setUploading(true);
    try {
      // Reuse the logo upload endpoint for storage only; restaurant.logoUrl is never written.
      const { url } = await upload('/api/uploads/restaurants/logo', file);
      patch({ badgeSource: 'custom', badgeImageUrl: url });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <SettingsShell
      mark={<BrandedQrCode value={previewValue} size={64} style={effective} label={cafeName} />}
      markClass="seal"
      surface={t('surface')}
      title={t('title')}
      sub={t('sub')}
      actions={qrCustom ? (
        <>
          <button className="btn sm ghost" type="button"
            onClick={() => commit(randomQrStyle(style))}>🎲 {t('shuffle')}</button>
          <button className="btn sm ghost" type="button"
            onClick={() => commit({
              ...DEFAULT_QR_STYLE,
              badgeSource: style.badgeSource ?? null,
              badgeImageUrl: style.badgeImageUrl ?? null,
            })}>{t('reset')}</button>
        </>
      ) : undefined}
      aside={
        <Specimen label={t('spec')}>
          <div className="qr-spec-stage">
            <BrandedQrCode value={previewValue} size={196} style={effective} label={cafeName} />
          </div>
          <p className="stg-spec-note">{t('specNote')}</p>
        </Specimen>
      }
    >
      {!qrCustom ? (
        <PaneSection no="01" title={t('secLocked')} sub={t('secLockedSub')}>
          <p className="qr-style-hint">{t('proSoon')}</p>
        </PaneSection>
      ) : (
        <>
          <PaneSection no="01" title={t('secPreset')} sub={t('secPresetSub')}>
            <div className="qr-presets">
              {QR_PRESETS.map((p) => (
                <button key={p.id} type="button" className="qr-preset" title={t('preset_' + p.id)}
                  onClick={() => commit({
                    ...DEFAULT_QR_STYLE,
                    ...p.style,
                    // A preset is a palette, not a rebrand — the center mark survives it.
                    badgeSource: style.badgeSource ?? null,
                    badgeImageUrl: style.badgeImageUrl ?? null,
                  })}>
                  <span className="qr-preset-swatch">
                    <i style={{ background: p.swatch[0] }} />
                    <i style={{ background: p.swatch[1] }} />
                    <i style={{ background: p.swatch[2] }} />
                  </span>
                  <b>{t('preset_' + p.id)}</b>
                </button>
              ))}
            </div>
          </PaneSection>

          {/* Three sources, not an upload button. A café that already put its logo on the
              profile should recognise it here, not be asked for the same file twice. */}
          <PaneSection no="02" title={t('secCenter')} sub={t('secCenterSub')}>
            <div className="qr-logo-picks">
              <button type="button" className={'qr-logo-pick' + (source === null ? ' on' : '')}
                aria-pressed={source === null}
                onClick={() => patch({ badgeSource: null })}>
                <span className="qr-logo-face">{cafeName.charAt(0) || 'S'}</span>
                <b>{t('logoNone')}</b>
              </button>

              {cafeLogo && (
                <button type="button" className={'qr-logo-pick' + (source === 'cafe' ? ' on' : '')}
                  aria-pressed={source === 'cafe'}
                  onClick={() => patch({ badgeSource: 'cafe' })}>
                  <span className="qr-logo-face" style={{ backgroundImage: `url('${cafeLogo}')` }} />
                  <b>{t('logoCafe')}</b>
                </button>
              )}

              <button type="button" className={'qr-logo-pick' + (source === 'custom' ? ' on' : '')}
                aria-pressed={source === 'custom'} disabled={uploading}
                onClick={() => (customThumb ? patch({ badgeSource: 'custom' }) : fileRef.current?.click())}>
                <span className="qr-logo-face"
                  style={customThumb ? { backgroundImage: `url('${customThumb}')` } : undefined}>
                  {!customThumb && '＋'}
                </span>
                <b>{uploading ? t('uploading') : t('logoCustom')}</b>
              </button>
            </div>

            <div className="qr-logo-ctl">
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
              <button className="btn sm ghost" type="button" disabled={uploading}
                onClick={() => fileRef.current?.click()}>
                {uploading ? t('uploading') : customThumb ? t('logoReplace') : t('logoUpload')}
              </button>
            </div>

            <p className="qr-style-hint">
              {source === 'cafe' ? t('logoCafeHint') : cafeLogo ? t('hint') : t('logoNoCafeHint')}
            </p>
          </PaneSection>

          <PaneSection no="03" title={t('secColor')} sub={t('secColorSub')}>
            <div className="qr-style-row">
              <span className="qr-style-lbl">{t('ink')}</span>
              <div className="qr-swatches">
                {QR_INK_IDS.map((id) => (
                  <button key={id} type="button"
                    className={'qr-swatch' + (style.inkId === id ? ' on' : '')}
                    style={{ background: qrHex(id, QR_INK) }}
                    title={id} aria-label={id}
                    onClick={() => patch({ inkId: id })} />
                ))}
              </div>
            </div>
            <div className={'qr-style-row' + (hasBadgeImage ? ' dim' : '')}>
              <span className="qr-style-lbl">{t('color')}</span>
              <div className="qr-swatches">
                {QR_PALETTE.map((c) => (
                  <button key={c.id} type="button"
                    className={'qr-swatch' + (style.colorId === c.id ? ' on' : '')}
                    style={{ background: c.fill }}
                    title={c.id} aria-label={c.id}
                    disabled={hasBadgeImage}
                    onClick={() => patch({ colorId: c.id })} />
                ))}
              </div>
            </div>
          </PaneSection>

          <PaneSection no="04" title={t('secShape')} sub={t('secShapeSub')}>
            <div className="qr-style-row">
              <span className="qr-style-lbl">{t('dots')}</span>
              <div className="qr-fonts">
                {QR_DOT_IDS.map((id) => (
                  <button key={id} type="button"
                    className={'qr-font' + (style.dotStyle === id ? ' on' : '')}
                    onClick={() => patch({ dotStyle: id })}>{t('dot_' + id)}</button>
                ))}
              </div>
            </div>
            <div className="qr-style-row">
              <span className="qr-style-lbl">{t('eyes')}</span>
              <div className="qr-fonts">
                {QR_EYE_IDS.map((id) => (
                  <button key={id} type="button"
                    className={'qr-font' + (style.eyeStyle === id ? ' on' : '')}
                    onClick={() => patch({ eyeStyle: id })}>{t('eye_' + id)}</button>
                ))}
              </div>
            </div>
            <div className="qr-style-row">
              <span className="qr-style-lbl">{t('badgeShape')}</span>
              <div className="qr-fonts">
                {QR_BADGE_SHAPE_IDS.map((id) => (
                  <button key={id} type="button"
                    className={'qr-font' + (style.badgeShape === id ? ' on' : '')}
                    onClick={() => patch({ badgeShape: id })}>{t('badge_' + id)}</button>
                ))}
              </div>
            </div>
          </PaneSection>

          <PaneSection no="05" title={t('secType')} sub={t('secTypeSub')}>
            <div className={'qr-style-row' + (hasBadgeImage ? ' dim' : '')}>
              <span className="qr-style-lbl">{t('font')}</span>
              <div className="qr-fonts">
                {QR_FONT_IDS.map((id) => (
                  <button key={id} type="button"
                    className={'qr-font' + (style.fontId === id ? ' on' : '')}
                    style={{ fontFamily: QR_FONT_STACK[id] }}
                    disabled={hasBadgeImage}
                    onClick={() => patch({ fontId: id })}>{t('ft_' + id)}</button>
                ))}
              </div>
            </div>
          </PaneSection>
        </>
      )}
    </SettingsShell>
  );
}
