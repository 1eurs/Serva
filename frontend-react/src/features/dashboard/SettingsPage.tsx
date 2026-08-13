import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuth, can } from '../../lib/auth';
import { useT, type Dict } from '../../lib/i18n';
import { useSkin, type Skin } from '../../lib/skin';
import { MenuLookManager } from './MenuManager';
import { CafeSection, BranchPrinterSection, ReceiptSection, PlanSection } from './RestaurantProfile';
import LoyaltySetup from './LoyaltySetup';
import { SettingsShell, PaneSection, Specimen } from './SettingsShell';
import { FONT_STACKS, parseCustomTheme } from '../customer/menuThemes';
import type { Restaurant } from '../../lib/types';
import './settings.css';

export type SettingsSection = 'cafe' | 'branch' | 'look' | 'receipt' | 'loyalty' | 'appearance' | 'plan';

const DICT: Dict = {
  ar: {
    sec_cafe: 'المقهى', sec_branch: 'الفرع والطابعة', sec_look: 'شكل القائمة', sec_receipt: 'الفاتورة',
    sec_loyalty: 'الولاء', sec_appearance: 'المظهر', sec_plan: 'الباقة',
    aprTitle: 'مظهر لوحة التحكم', aprSub: 'اختر الطابع الذي يناسبك — يظهر على هذا الجهاز فقط.',
    aprBold: 'جريء', aprBoldSub: 'الأخضر والحدود السميكة والظلال الصلبة — الطابع الأصلي.',
    aprPro: 'احترافي', aprProSub: 'رمادي هادئ وحدود شعرة وزوايا ناعمة — والأخضر يبقى، لكن للأزرار والمهم فقط.',
    aprActive: 'الحالي',
    aprSurface: 'هذا الجهاز فقط', aprPickTitle: 'اختر الطابع', aprPickSub: 'لوحتان مختلفتان تماماً — تتغيّر الألوان والحدود والظلال والخط معاً.',
    aprSpec: 'شاشتك الآن', aprSpecNote: 'مصغّر حيّ يُرسم بنفس متغيّرات الطابع الحالي — بدّل الطابع وشاهده يتغيّر هنا.',
    lookSurface: 'قائمة العملاء', lookTitle: 'شكل القائمة',
    lookSub: 'الألوان والخط والزخارف التي يراها عميلك عند مسح رمز QR. المعاينة على اليمين حيّة.',
    lookMark: 'أب',
  },
  en: {
    sec_cafe: 'Café', sec_branch: 'Branch & printer', sec_look: 'Menu look', sec_receipt: 'Receipt',
    sec_loyalty: 'Loyalty', sec_appearance: 'Appearance', sec_plan: 'Plan',
    aprTitle: 'Dashboard appearance', aprSub: 'Pick the look that suits you — applies to this device only.',
    aprBold: 'Bold', aprBoldSub: 'Green, thick keylines and hard offset shadows — the original look.',
    aprPro: 'Professional', aprProSub: 'Quiet greys, hairline borders and soft corners — the green stays, but only on buttons and what matters.',
    aprActive: 'Current',
    aprSurface: 'This device only', aprPickTitle: 'Pick a look', aprPickSub: 'Two genuinely different palettes — color, borders, shadows and type all change together.',
    aprSpec: 'Your screen right now', aprSpecNote: 'A live miniature drawn from the tokens in use — switch looks and it redraws here first.',
    lookSurface: 'Customer menu', lookTitle: 'Menu look',
    lookSub: 'The colors, type and patterns a customer meets after scanning. The stage keeps a live phone preview.',
    lookMark: 'Aa',
  },
};

/** A miniature of the dashboard chrome, built from the live skin tokens (--bw,
 *  --hard-*, --lime) rather than a fixed mockup — so flipping the skin re-weights
 *  it in place, which is exactly what the setting does to the real screen. */
function ChromeSpecimen() {
  return (
    <div className="stg-chrome" aria-hidden="true">
      <div className="stg-chrome-rail"><i /><i /><i /><i /></div>
      <div className="stg-chrome-body">
        <div className="stg-chrome-top" />
        <div className="stg-chrome-card">
          <i /><i /><i />
          <span className="stg-chrome-btn">Save</span>
        </div>
      </div>
    </div>
  );
}

function AppearancePane() {
  const t = useT(DICT);
  const { skin, setSkin } = useSkin();
  const cards: { key: Skin; label: string; sub: string }[] = [
    { key: 'bold', label: t('aprBold'), sub: t('aprBoldSub') },
    { key: 'pro', label: t('aprPro'), sub: t('aprProSub') },
  ];
  return (
    <SettingsShell
      mark="◐"
      surface={t('aprSurface')}
      title={t('aprTitle')}
      sub={t('aprSub')}
      aside={
        <Specimen label={t('aprSpec')}>
          <ChromeSpecimen />
          <p className="stg-spec-note">{t('aprSpecNote')}</p>
        </Specimen>
      }
    >
      <PaneSection no="01" title={t('aprPickTitle')} sub={t('aprPickSub')}>
        <div className="skin-cards">
          {cards.map((c) => (
            <button key={c.key} type="button" className={'skin-card ' + c.key + (skin === c.key ? ' on' : '')}
              aria-pressed={skin === c.key} onClick={() => setSkin(c.key)}>
              <span className={'skin-card-preview ' + c.key} aria-hidden="true">
                <span className="sk-bar" /><span className="sk-line" /><span className="sk-line short" />
              </span>
              <span className="skin-card-copy">
                <b>{c.label}</b>
                <span>{c.sub}</span>
              </span>
              {skin === c.key && <span className="skin-card-badge">{t('aprActive')}</span>}
            </button>
          ))}
        </div>
      </PaneSection>
    </SettingsShell>
  );
}

/**
 * The look studio brings its own live phone stage, so this pane gets the hero and
 * hands the whole width to the studio. The mark is a type specimen set in the
 * café's own menu font and paper — the pane's subject, rendered in its own terms.
 */
function LookPane({ branchId }: { branchId?: number }) {
  const { user } = useAuth();
  const t = useT(DICT);
  const rid = user!.restaurantId!;
  const restaurantQ = useQuery({ queryKey: ['restaurant', rid], queryFn: () => api.get<Restaurant>(`/api/restaurants/${rid}`) });
  const theme = useMemo(() => parseCustomTheme(restaurantQ.data?.themeCustomJson), [restaurantQ.data?.themeCustomJson]);

  return (
    <SettingsShell
      mark={t('lookMark')}
      markClass="type"
      markStyle={{ background: theme.paper, color: theme.text, fontFamily: FONT_STACKS[theme.font] }}
      surface={t('lookSurface')}
      title={t('lookTitle')}
      sub={t('lookSub')}
    >
      <MenuLookManager branchId={branchId} />
    </SettingsShell>
  );
}

export default function SettingsPage({
  section,
  onSection,
  branchId,
}: {
  section?: SettingsSection;
  onSection: (s: SettingsSection) => void;
  branchId?: number;
}) {
  const { user } = useAuth();
  const t = useT(DICT);

  const items = useMemo(() => ([
    { key: 'cafe', label: t('sec_cafe'), show: can(user, 'PROFILE') },
    { key: 'branch', label: t('sec_branch'), show: can(user, 'PROFILE') },
    { key: 'look', label: t('sec_look'), show: can(user, 'MENU') },
    { key: 'receipt', label: t('sec_receipt'), show: can(user, 'PROFILE') },
    { key: 'loyalty', label: t('sec_loyalty'), show: can(user, 'PROFILE') },
    { key: 'appearance', label: t('sec_appearance'), show: true },
    { key: 'plan', label: t('sec_plan'), show: can(user, 'PROFILE') },
  ] as { key: SettingsSection; label: string; show: boolean }[]).filter((i) => i.show),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [user, t]);

  const itemKeys = items.map((i) => i.key).join(',');
  useEffect(() => {
    if (items.length && !items.some((i) => i.key === section)) onSection(items[0].key);
  }, [itemKeys, section]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = items.some((i) => i.key === section) ? section : items[0]?.key;

  return (
    <div className="tables-wrap settings-page">
      <nav className="seg settings-subnav" role="tablist">
        {items.map((i) => (
          <button key={i.key} type="button" role="tab" aria-selected={active === i.key}
            className={active === i.key ? 'on' : ''} onClick={() => onSection(i.key)}>
            {i.label}
          </button>
        ))}
      </nav>
      {/* key= remounts on switch so the pane's entrance runs every time */}
      <div className="settings-pane" key={active}>
        {active === 'cafe' && <CafeSection branchId={branchId} />}
        {active === 'branch' && <BranchPrinterSection branchId={branchId} />}
        {active === 'look' && <LookPane branchId={branchId} />}
        {active === 'receipt' && <ReceiptSection branchId={branchId} />}
        {active === 'loyalty' && <LoyaltySetup />}
        {active === 'appearance' && <AppearancePane />}
        {active === 'plan' && <PlanSection />}
      </div>
    </div>
  );
}
