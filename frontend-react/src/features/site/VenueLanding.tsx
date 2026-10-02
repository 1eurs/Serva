import { useEffect, useState, type ComponentType } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Ltr, useI18n } from '../../lib/i18n';
import { ensureGoogleFonts } from '../../lib/fonts';
import type { Lang } from '../../lib/types';
import { SiteFooter } from './SiteFooter';
import { Logo, LangSwitch } from './SiteHeader';
import LeadForm from './LeadForm';
import { CUSTOMERS } from './customers';
import { useReveal } from './reveal';
import { Icon, type IconName } from './icons';
import { PadScene, KitchenScene, CloseScene, QrScene } from './DayScenes';
import { HeroDevices, VENUES, isVenue, type VenueKey } from './VenueHero';
import './site.css';

/* ─────────────────────────────────────────────────────────────────────────
   Serva — marketing landing, "built for your venue" (served at /).

   Clarity first: the headline says what Serva is in plain words, and the reader
   picks what they run — café, restaurant, food truck, juice & desserts. The pick
   rewrites the headline and redraws the product (the order board on a counter
   tablet, a guest's phone in front of it), so an owner sees their own kind of
   venue on the first screen. The pick lives in the URL (/?for=food-truck), so a
   sales message can open the page already set to the prospect's venue.

   Below the hero the features come in four plain groups — take orders, run the
   kitchen, know your numbers, bring guests back — each with its product screen.
   ───────────────────────────────────────────────────────────────────────── */

type Feature = { icon: IconName; t: string; d: string };
type Group = { id: string; icon: IconName; title: string; sub: string; features: Feature[] };
type Plan = { name: string; price: string; tagline: string; features: string[]; featured?: boolean };
type Copy = {
  nav: { features: string; setup: string; pricing: string; faq: string; login: string; cta: string; menu: string; skip: string };
  hero: { eyebrow: string; l1: string; pre: string; post: string; sub: string; pick: string; cta: string; trust: string };
  features: { kicker: string; title: string; groups: Group[]; alsoTitle: string; also: Feature[] };
  setup: { kicker: string; title: string; steps: Feature[] };
  pricing: {
    kicker: string; title: string; cur: string; per: string; setup: string; badge: string;
    cta: string; plans: Plan[]; custom: { title: string; body: string; cta: string }; note: string;
  };
  faq: { kicker: string; title: string; more: string; items: { q: string; a: string }[] };
  contact: { kicker: string; title: string; sub: string };
};

const COPY: Record<Lang, Copy> = {
  en: {
    nav: { features: 'Features', setup: 'How it works', pricing: 'Pricing', faq: 'FAQ', login: 'Log in', cta: 'Book a consultation', menu: 'Menu', skip: 'Skip to content' },
    hero: {
      eyebrow: 'POS · QR ordering · Kitchen printing · Loyalty',
      l1: 'One system for', pre: 'your', post: '.',
      sub: 'Orders, kitchen and sales in one place. We set it up for you.',
      pick: 'What do you run?',
      cta: 'Book a consultation',
      trust: 'Our customers',
    },
    features: {
      kicker: 'Features',
      title: 'Everything in one system.',
      groups: [
        {
          id: 'orders', icon: 'pos', title: 'Take orders anywhere',
          sub: 'Counter, table, car or window.',
          features: [
            { icon: 'pos', t: 'Counter POS', d: 'Fast ordering. Cash, card or split.' },
            { icon: 'qr', t: 'QR ordering', d: 'Guests order from their phone. No app.' },
            { icon: 'car', t: 'Car orders', d: 'Guests order from the car. You bring it out.' },
            { icon: 'pager', t: 'Pagers & tracking', d: 'Call by pager. Guests track their order.' },
          ],
        },
        {
          id: 'kitchen', icon: 'printer', title: 'Run the kitchen',
          sub: 'Every order reaches the kitchen instantly.',
          features: [
            { icon: 'printer', t: 'Kitchen printing', d: 'Tickets print automatically.' },
            { icon: 'board', t: 'Order board', d: 'New, preparing, ready. One screen for the team.' },
            { icon: 'table', t: 'Tables', d: 'A QR code on every table.' },
          ],
        },
        {
          id: 'numbers', icon: 'chart', title: 'Know your numbers',
          sub: 'See your day before you close.',
          features: [
            { icon: 'chart', t: 'Daily reports', d: 'Sales, best sellers, busy hours.' },
            { icon: 'cash', t: 'Till & cash', d: 'Open and close the till. See any difference.' },
            { icon: 'box', t: 'Stock', d: 'Know what’s running low.' },
          ],
        },
        {
          id: 'guests', icon: 'heart', title: 'Win regulars',
          sub: 'Rewards and a menu with your brand.',
          features: [
            { icon: 'heart', t: 'Loyalty stamps', d: 'Every 10th drink free, or your own reward.' },
            { icon: 'palette', t: 'Branded menu', d: 'Your colours, your photos.' },
            { icon: 'globe', t: 'Arabic & English', d: 'Guests pick their language.' },
          ],
        },
      ],
      alsoTitle: 'Also included',
      also: [
        { icon: 'users', t: 'Staff permissions', d: '' },
        { icon: 'pin', t: 'Multiple branches', d: '' },
        { icon: 'board', t: 'Sold-out switch', d: '' },
        { icon: 'wrench', t: 'Setup by our team', d: '' },
      ],
    },
    setup: {
      kicker: 'How it works', title: 'Live in a week. We do the setup.',
      steps: [
        { icon: 'chat', t: 'Talk to us', d: 'Tell us how you serve.' },
        { icon: 'wrench', t: 'We set it up', d: 'We build your menu and connect your printers.' },
        { icon: 'rocket', t: 'Go live', d: 'We train your team. You start taking orders.' },
        { icon: 'grow', t: 'Grow', d: 'Add features or branches anytime.' },
      ],
    },
    pricing: {
      kicker: 'Pricing', title: 'Simple pricing.',
      cur: 'OMR', per: 'per month', setup: '+ 50 OMR one-time setup', badge: 'Most popular', cta: 'Start with',
      plans: [
        { name: 'Standard', price: '15', tagline: 'For one branch.', features: ['Point of sale', 'Online & QR ordering', 'Menu management', 'Basic analytics', 'Single branch', 'Email support'] },
        { name: 'Pro', price: '20', tagline: 'Adds loyalty and branches.', featured: true, features: ['Everything in Standard', 'Loyalty program', 'Advanced analytics', 'Customer data tools', 'Multi-branch', 'Priority support'] },
      ],
      custom: { title: 'Several branches or a franchise?', body: 'We’ll make you a plan.', cta: 'Talk to us' },
      note: 'All prices in OMR.',
    },
    faq: {
      kicker: 'FAQ', title: 'Questions', more: 'Another question? Send it with the form.',
      items: [
        { q: 'Is there a setup fee?', a: 'Yes, 50 OMR once. It covers your menu and launch.' },
        { q: 'Do I need special hardware?', a: 'No. It runs on your phone, tablet or computer. We can help you add a printer.' },
        { q: 'Can guests order from the car?', a: 'Yes. They scan the car QR and add their plate. You bring the order out.' },
        { q: 'Does it work for a food truck?', a: 'Yes. One phone is enough.' },
        { q: 'Can you move my menu over?', a: 'Yes. Send it to us and we build it.' },
        { q: 'Standard or Pro?', a: 'Pro adds loyalty, advanced reports, customer data and multiple branches.' },
      ],
    },
    contact: {
      kicker: 'Get started', title: 'Tell us about your business.',
      sub: 'We’ll call you within one working day.',
    },
  },
  ar: {
    nav: { features: 'المزايا', setup: 'كيف نبدأ', pricing: 'الأسعار', faq: 'الأسئلة', login: 'تسجيل الدخول', cta: 'احجز استشارة', menu: 'القائمة', skip: 'انتقل إلى المحتوى' },
    hero: {
      eyebrow: 'نقاط البيع · الطلب بـ QR · طباعة المطبخ · الولاء',
      l1: 'نظامٌ واحد', pre: 'يدير', post: '.',
      sub: 'الطلبات والمطبخ والمبيعات في مكان واحد، ونحن نجهّزه لك.',
      pick: 'ما نوع نشاطك؟',
      cta: 'احجز استشارة',
      trust: 'عملاؤنا',
    },
    features: {
      kicker: 'المزايا',
      title: 'كل شيء في نظام واحد.',
      groups: [
        {
          id: 'orders', icon: 'pos', title: 'استقبل الطلبات من أي مكان',
          sub: 'من الكاونتر أو الطاولة أو السيارة أو النافذة.',
          features: [
            { icon: 'pos', t: 'نقاط البيع', d: 'طلب سريع، والدفع نقداً أو بالبطاقة.' },
            { icon: 'qr', t: 'الطلب بـ QR', d: 'الضيف يطلب من هاتفه بدون تطبيق.' },
            { icon: 'car', t: 'طلبات السيارة', d: 'الضيف يطلب من سيارته، وأنت توصل الطلب.' },
            { icon: 'pager', t: 'البيجر وتتبع الطلب', d: 'نادِ برقم البيجر، والضيف يتابع طلبه.' },
          ],
        },
        {
          id: 'kitchen', icon: 'printer', title: 'نظّم المطبخ',
          sub: 'كل طلب يصل المطبخ فوراً.',
          features: [
            { icon: 'printer', t: 'طباعة المطبخ', d: 'التذاكر تُطبع تلقائياً.' },
            { icon: 'board', t: 'لوحة الطلبات', d: 'جديد، قيد التحضير، جاهز. شاشة واحدة للفريق.' },
            { icon: 'table', t: 'الطاولات', d: 'رمز QR لكل طاولة.' },
          ],
        },
        {
          id: 'numbers', icon: 'chart', title: 'اعرف أرقامك',
          sub: 'اعرف حصيلة يومك قبل الإغلاق.',
          features: [
            { icon: 'chart', t: 'تقارير يومية', d: 'المبيعات، الأكثر طلباً، أوقات الذروة.' },
            { icon: 'cash', t: 'الدرج والنقد', d: 'افتح الدرج وأغلقه، واعرف أي فرق.' },
            { icon: 'box', t: 'المخزون', d: 'اعرف ما يوشك على النفاد.' },
          ],
        },
        {
          id: 'guests', icon: 'heart', title: 'اكسب زبائن دائمين',
          sub: 'مكافآت وقائمة بهويتك.',
          features: [
            { icon: 'heart', t: 'أختام الولاء', d: 'العاشر مجاناً، أو المكافأة التي تختارها.' },
            { icon: 'palette', t: 'قائمة بهويتك', d: 'ألوانك وصورك.' },
            { icon: 'globe', t: 'عربي وإنجليزي', d: 'الضيف يختار لغته.' },
          ],
        },
      ],
      alsoTitle: 'وأيضاً',
      also: [
        { icon: 'users', t: 'صلاحيات الموظفين', d: '' },
        { icon: 'pin', t: 'فروع متعددة', d: '' },
        { icon: 'board', t: 'إخفاء الأصناف النافدة', d: '' },
        { icon: 'wrench', t: 'التجهيز علينا', d: '' },
      ],
    },
    setup: {
      kicker: 'كيف نبدأ', title: 'جاهز خلال أسبوع، والتجهيز علينا.',
      steps: [
        { icon: 'chat', t: 'تواصل معنا', d: 'أخبرنا كيف تعمل.' },
        { icon: 'wrench', t: 'نجهّز كل شيء', d: 'نبني قائمتك ونوصّل الطابعات.' },
        { icon: 'rocket', t: 'انطلق', d: 'ندرّب فريقك وتبدأ باستقبال الطلبات.' },
        { icon: 'grow', t: 'توسّع', d: 'أضف مزايا أو فروعاً متى شئت.' },
      ],
    },
    pricing: {
      kicker: 'الأسعار', title: 'أسعار واضحة.',
      cur: 'ر.ع', per: 'شهرياً', setup: '+ 50 ر.ع تجهيز لمرة واحدة', badge: 'الأكثر طلباً', cta: 'ابدأ بخطة',
      plans: [
        { name: 'ستاندرد', price: '15', tagline: 'لفرع واحد.', features: ['نقاط البيع', 'الطلب أونلاين وبـ QR', 'إدارة القائمة', 'تحليلات أساسية', 'فرع واحد', 'دعم بالبريد'] },
        { name: 'برو', price: '20', tagline: 'مع الولاء والفروع.', featured: true, features: ['كل مزايا ستاندرد', 'برنامج الولاء', 'تحليلات متقدمة', 'بيانات العملاء', 'فروع متعددة', 'دعم أولوية'] },
      ],
      custom: { title: 'عدة فروع أو امتياز تجاري؟', body: 'نجهّز لك خطة خاصة.', cta: 'تواصل معنا' },
      note: 'جميع الأسعار بالريال العُماني.',
    },
    faq: {
      kicker: 'الأسئلة الشائعة', title: 'أسئلة', more: 'عندك سؤال آخر؟ أرسله عبر النموذج.',
      items: [
        { q: 'هل توجد رسوم تجهيز؟', a: 'نعم، 50 ر.ع مرة واحدة، وتشمل القائمة والإطلاق.' },
        { q: 'هل أحتاج أجهزة خاصة؟', a: 'لا. يعمل على هاتفك أو جهازك اللوحي أو الكمبيوتر، ونساعدك في إضافة طابعة.' },
        { q: 'هل يطلب الضيف من السيارة؟', a: 'نعم. يمسح رمز السيارات ويضيف رقم اللوحة، وأنت توصل الطلب.' },
        { q: 'هل يناسب عربة الطعام؟', a: 'نعم. يكفي هاتف واحد.' },
        { q: 'هل تنقلون قائمتي؟', a: 'نعم. أرسلها لنا ونحن نبنيها.' },
        { q: 'ستاندرد أم برو؟', a: 'برو يضيف الولاء والتقارير المتقدمة وبيانات العملاء والفروع المتعددة.' },
      ],
    },
    contact: {
      kicker: 'ابدأ الآن', title: 'حدّثنا عن نشاطك.',
      sub: 'نتصل بك خلال يوم عمل.',
    },
  },
};

/* The product screen that goes with each feature group. */
const GROUP_SCENE: Record<string, ComponentType<{ lang: Lang }>> = {
  orders: PadScene, kitchen: KitchenScene, numbers: CloseScene, guests: QrScene,
};

/* ── small pieces ────────────────────────────────────────────────────────── */
function Check({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className={`mt-[3px] shrink-0 ${className}`}>
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Label({ children, tone = 'green' }: { children: string; tone?: 'green' | 'leaf' }) {
  return <p className={`text-sm font-semibold ${tone === 'leaf' ? 'text-sv-leaf' : 'text-sv-green'}`}>{children}</p>;
}

/* ── page ────────────────────────────────────────────────────────────────── */
export default function VenueLanding() {
  const { lang, dir } = useI18n();
  const rtl = dir === 'rtl';
  const c = COPY[lang];
  const [params, setParams] = useSearchParams();
  const forParam = params.get('for');
  const venueKey: VenueKey = isVenue(forParam) ? forParam : 'cafe';
  const venue = VENUES.find((v) => v.key === venueKey)!;
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useReveal();

  useEffect(() => {
    ensureGoogleFonts(['Sora:wght@500;600;700', 'IBM+Plex+Sans:wght@400;500;600']);
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    const html = document.documentElement;
    const prev = { behavior: html.style.scrollBehavior, padding: html.style.scrollPaddingTop };
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) html.style.scrollBehavior = 'smooth';
    html.style.scrollPaddingTop = '80px';
    return () => {
      window.removeEventListener('scroll', onScroll);
      html.style.scrollBehavior = prev.behavior;
      html.style.scrollPaddingTop = prev.padding;
    };
  }, []);

  const pick = (k: VenueKey) => setParams((p) => { const n = new URLSearchParams(p); n.set('for', k); return n; }, { replace: true, preventScrollReset: true });

  const nav = [
    { href: '#features', label: c.nav.features },
    { href: '#setup', label: c.nav.setup },
    { href: '#pricing', label: c.nav.pricing },
    { href: '#faq', label: c.nav.faq },
  ];
  // Over the green hero the header is see-through with white type; once scrolled it turns solid.
  const solid = scrolled || menuOpen;
  const quiet = solid ? 'text-sv-slate hover:bg-sv-mist hover:text-sv-ink' : 'text-white/75 hover:bg-white/10 hover:text-white';
  const btn = 'inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-medium transition-colors';

  return (
    <div id="neo" dir={dir} className={lang === 'ar' ? 'lang-ar' : ''}>
      <a href="#top" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-sv-ink focus:shadow-lift">
        {c.nav.skip}
      </a>

      {/* ── HEADER ──────────────────────────────────────────── */}
      <header className={`fixed inset-x-0 top-0 z-50 border-b transition-colors duration-300 ${solid ? 'border-sv-line bg-white/95 text-sv-ink backdrop-blur-md' : 'border-transparent bg-transparent text-white'}`}>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-5 sm:px-8">
          <a href="#top" aria-label="Serva"><Logo tone={solid ? 'ink' : 'white'} /></a>
          <nav className="hidden items-center gap-1 lg:flex">
            {nav.map((n) => (
              <a key={n.href} href={n.href} className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${quiet}`}>{n.label}</a>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <LangSwitch className={`hidden sm:inline-flex ${quiet}`} />
            <Link to="/dashboard" className={`hidden h-10 items-center rounded-lg px-3 text-sm font-medium transition-colors sm:inline-flex ${quiet}`}>{c.nav.login}</Link>
            <a href="#contact" className={`ms-1 hidden h-10 items-center rounded-lg px-4 text-sm font-medium transition-colors md:inline-flex ${solid ? 'bg-sv-green text-white hover:bg-sv-deep' : 'bg-white text-sv-forest hover:bg-sv-tint'}`}>
              {c.nav.cta}
            </a>
            <button
              type="button" onClick={() => setMenuOpen((v) => !v)}
              aria-label={c.nav.menu} aria-expanded={menuOpen} aria-controls="sv-menu"
              className={`flex h-11 w-11 items-center justify-center rounded-lg lg:hidden ${solid ? 'hover:bg-sv-mist' : 'hover:bg-white/10'}`}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          </div>
        </div>
        {menuOpen && (
          <div id="sv-menu" className="border-t border-sv-line bg-white px-5 pb-5 pt-2 lg:hidden">
            <nav className="flex flex-col">
              {nav.map((n) => (
                <a key={n.href} href={n.href} onClick={() => setMenuOpen(false)} className="border-b border-sv-line py-3.5 text-base font-medium">{n.label}</a>
              ))}
            </nav>
            <div className="mt-4 flex items-center gap-2">
              <LangSwitch className="border border-sv-line text-sv-ink" />
              <Link to="/dashboard" onClick={() => setMenuOpen(false)} className="inline-flex h-10 items-center rounded-lg border border-sv-line px-4 text-sm font-medium">{c.nav.login}</Link>
            </div>
            <a href="#contact" onClick={() => setMenuOpen(false)} className={`${btn} mt-4 w-full bg-sv-green text-white hover:bg-sv-deep`}>{c.nav.cta}</a>
          </div>
        )}
      </header>

      <main id="top">
        {/* ── HERO ─────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-sv-forest text-white">
          {/* a soft light from behind the devices, so the green isn't a flat slab */}
          <div aria-hidden="true" className="pointer-events-none absolute -top-40 end-[-10%] h-[640px] w-[640px] rounded-full bg-[radial-gradient(closest-side,rgba(110,231,183,0.22),transparent)]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-14 pt-24 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.04fr)] lg:gap-10 lg:pb-16 lg:pt-28">
            <div>
              <p className="text-sm font-medium text-sv-leaf">{c.hero.eyebrow}</p>
              {/* Two fixed lines, so switching venue swaps a word instead of reflowing the hero. */}
              <h1 className="sv-h1 sv-h1-split mt-5">
                <span className="block">{c.hero.l1}</span>{' '}
                <span className="block whitespace-nowrap">
                  {c.hero.pre}{' '}<span key={venue.key} className="sv-swap inline-block text-sv-leaf">{venue.noun[lang]}</span>{c.hero.post}
                </span>
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/75">{c.hero.sub}</p>

              {/* the pick — it rewrites the headline and the product beside it */}
              <p id="sv-pick" className="mt-7 text-sm font-medium text-white/60">{c.hero.pick}</p>
              <div role="group" aria-labelledby="sv-pick" className="mt-3 flex flex-wrap gap-2">
                {VENUES.map((v) => {
                  const on = v.key === venue.key;
                  return (
                    <button
                      key={v.key} type="button" aria-pressed={on} onClick={() => pick(v.key)}
                      className={`inline-flex h-11 items-center gap-2 rounded-full px-3 text-sm font-medium transition-colors ${on ? 'bg-white text-sv-forest' : 'bg-white/[0.07] text-white/85 ring-1 ring-inset ring-white/15 hover:bg-white/[0.13]'}`}
                    >
                      <Icon name={v.icon} size={18} />{v.label[lang]}
                    </button>
                  );
                })}
              </div>
              <div key={venue.key} className="sv-swap mt-4">
                <p className="text-xs font-medium text-white/55">{venue.setupLabel[lang]}</p>
                <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-[15px]">
                  {venue.setup.map((s) => (
                    <li key={s.en} className="flex gap-1.5"><Check className="text-sv-leaf" />{s[lang]}</li>
                  ))}
                </ul>
              </div>

              <a href="#contact" className={`${btn} mt-8 bg-white text-sv-forest hover:bg-sv-tint`}>
                {c.hero.cta} <span aria-hidden="true">{rtl ? '←' : '→'}</span>
              </a>
            </div>

            <HeroDevices venue={venue} lang={lang} />
          </div>

          {/* who already runs on it */}
          <div className="relative border-t border-white/10 bg-sv-forest-deep/60">
            <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-7 sm:px-8 lg:flex-row lg:items-center lg:gap-10">
              <h2 className="shrink-0 text-sm font-medium text-white/60">{c.hero.trust}</h2>
              <ul className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:flex lg:flex-1 lg:justify-between">
                {CUSTOMERS.map((cu) => (
                  <li key={cu.key} className="flex items-center gap-3">
                    {cu.logo ? (
                      <img src={cu.logo} alt="" width={44} height={44} loading="lazy" decoding="async" className="h-11 w-11 shrink-0 rounded-xl bg-white object-cover" />
                    ) : (
                      <span aria-hidden="true" className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-white font-display text-[10px] font-semibold leading-[1.1] text-sv-forest" dir="ltr">
                        <span>Hub</span><span className="text-sv-green">&amp; co</span>
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block text-sm font-medium" translate="no">{cu.name.ar === cu.name.en ? <Ltr>{cu.name[lang]}</Ltr> : cu.name[lang]}</span>
                      <span className="block text-xs text-white/55">{cu.kind[lang]}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── FEATURES ─────────────────────────────────────── */}
        <section id="features" aria-labelledby="sv-features" className="scroll-mt-16 bg-white pt-20 md:pt-28">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="max-w-2xl">
              <Label>{c.features.kicker}</Label>
              <h2 id="sv-features" className="sv-h2 mt-3">{c.features.title}</h2>
            </div>
            {/* jump links — the four groups at a glance */}
            <ul className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {c.features.groups.map((g) => (
                <li key={g.id}>
                  <a href={`#g-${g.id}`} className="flex h-full items-center gap-3 rounded-2xl border border-sv-line p-4 transition-colors hover:border-sv-green/40 hover:bg-sv-tint/50">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sv-tint text-sv-green"><Icon name={g.icon} /></span>
                    <span className="text-[15px] font-semibold leading-snug">{g.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {c.features.groups.map((g, i) => {
            const Scene = GROUP_SCENE[g.id];
            return (
              <div key={g.id} id={`g-${g.id}`} data-reveal className={`scroll-mt-16 py-20 md:py-24 ${i % 2 === 0 ? 'bg-white' : 'bg-sv-mist'}`}>
                <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:gap-16">
                  <div className={`sv-reveal ${i % 2 === 1 ? 'lg:order-2' : ''}`}>
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sv-green text-white"><Icon name={g.icon} size={24} /></span>
                    <h3 className="sv-h3 mt-5">{g.title}</h3>
                    <p className="mt-3 text-lg leading-relaxed text-sv-slate">{g.sub}</p>
                    <ul className={`mt-8 grid gap-x-8 gap-y-6 ${g.features.length > 3 ? 'sm:grid-cols-2' : ''}`}>
                      {g.features.map((f) => (
                        <li key={f.t} className="flex gap-4">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sv-tint text-sv-green"><Icon name={f.icon} size={20} /></span>
                          <span>
                            <span className="block font-semibold">{f.t}</span>
                            <span className="mt-1 block leading-relaxed text-sv-slate">{f.d}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className={`sv-reveal [transition-delay:120ms] ${i % 2 === 1 ? 'lg:order-1' : ''}`}>
                    <Scene lang={lang} />
                  </div>
                </div>
              </div>
            );
          })}

          {/* the rest, in one line */}
          <div className="border-t border-sv-line bg-white py-12">
            <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 sm:px-8 lg:flex-row lg:items-center lg:gap-10">
              <p className="shrink-0 text-sm font-semibold text-sv-ink">{c.features.alsoTitle}</p>
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:flex lg:flex-1 lg:justify-between">
                {c.features.also.map((f) => (
                  <li key={f.t} className="flex items-center gap-3 text-[15px]">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sv-mist text-sv-green"><Icon name={f.icon} size={18} /></span>
                    {f.t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ─────────────────────────────────── */}
        <section id="setup" aria-labelledby="sv-setup" className="scroll-mt-16 bg-sv-forest py-20 text-white md:py-28">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="max-w-2xl">
              <Label tone="leaf">{c.setup.kicker}</Label>
              <h2 id="sv-setup" className="sv-h2 mt-3">{c.setup.title}</h2>
            </div>
            <ol className="relative mt-14 grid gap-10 md:grid-cols-2 lg:grid-cols-4 lg:gap-8">
              {/* the thread joining the steps, behind their icons */}
              <span aria-hidden="true" className="absolute inset-x-6 top-6 hidden h-px bg-white/15 lg:block" />
              {c.setup.steps.map((s, i) => (
                <li key={s.t} className="relative">
                  <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-sv-leaf text-sv-forest ring-8 ring-sv-forest">
                    <Icon name={s.icon} />
                  </span>
                  <p className="mt-5 text-sm font-medium text-white/50">{lang === 'ar' ? `الخطوة ${i + 1}` : `Step ${i + 1}`}</p>
                  <h3 className="mt-1 text-xl font-semibold">{s.t}</h3>
                  <p className="mt-2 leading-relaxed text-white/70">{s.d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── PRICING ──────────────────────────────────────── */}
        <section id="pricing" aria-labelledby="sv-pricing" className="scroll-mt-16 bg-white py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <Label>{c.pricing.kicker}</Label>
              <h2 id="sv-pricing" className="sv-h2 mt-3">{c.pricing.title}</h2>
            </div>
            <div className="mx-auto mt-12 grid max-w-4xl gap-5 md:grid-cols-2">
              {c.pricing.plans.map((plan) => (
                <div key={plan.name} className={`relative flex flex-col rounded-2xl bg-white p-7 md:p-8 ${plan.featured ? 'shadow-lift ring-2 ring-sv-green' : 'shadow-card ring-1 ring-sv-line'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xl font-semibold">{plan.name}</h3>
                    {plan.featured && <span className="rounded-full bg-sv-tint px-3 py-1 text-xs font-medium text-sv-green">{c.pricing.badge}</span>}
                  </div>
                  <p className="mt-1 text-sv-slate">{plan.tagline}</p>
                  <p className="mt-7 flex items-baseline gap-2">
                    <span className="font-display text-6xl font-semibold tracking-[-0.04em] tnum">{plan.price}</span>
                    <span className="text-lg font-medium">{c.pricing.cur}</span>
                    <span className="text-sm text-sv-slate">{c.pricing.per}</span>
                  </p>
                  <p className="mt-1 text-sm text-sv-slate">{c.pricing.setup}</p>
                  <ul className="mt-7 space-y-3 border-t border-sv-line pt-7">
                    {plan.features.map((f) => (
                      <li key={f} className="flex gap-3"><Check className="text-sv-green" />{f}</li>
                    ))}
                  </ul>
                  <a
                    href="#contact"
                    className={`${btn} mt-8 w-full ${plan.featured ? 'bg-sv-green text-white hover:bg-sv-deep' : 'border border-sv-line bg-white text-sv-ink hover:bg-sv-mist'}`}
                  >
                    {c.pricing.cta} {plan.name}
                  </a>
                </div>
              ))}
            </div>
            <div className="mx-auto mt-5 flex max-w-4xl flex-col items-start justify-between gap-5 rounded-2xl bg-sv-forest p-7 text-white md:flex-row md:items-center md:p-8">
              <div>
                <p className="text-lg font-semibold">{c.pricing.custom.title}</p>
                <p className="mt-1 text-white/70">{c.pricing.custom.body}</p>
              </div>
              <a href="#contact" className={`${btn} shrink-0 bg-white text-sv-forest hover:bg-sv-tint`}>
                {c.pricing.custom.cta} <span aria-hidden="true">{rtl ? '←' : '→'}</span>
              </a>
            </div>
            <p className="mx-auto mt-6 max-w-4xl text-sm text-sv-slate">{c.pricing.note}</p>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────── */}
        <section id="faq" aria-labelledby="sv-faq" className="scroll-mt-16 border-t border-sv-line bg-sv-mist py-20 md:py-28">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 sm:px-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-16">
            <div>
              <Label>{c.faq.kicker}</Label>
              <h2 id="sv-faq" className="sv-h2 mt-3">{c.faq.title}</h2>
              <a href="#contact" className="mt-6 inline-flex items-center gap-2 font-medium text-sv-green hover:underline">
                {c.faq.more} <span aria-hidden="true">{rtl ? '←' : '→'}</span>
              </a>
            </div>
            <div className="divide-y divide-sv-line rounded-2xl bg-white px-6 shadow-card ring-1 ring-sv-line">
              {c.faq.items.map((it) => (
                <details key={it.q} className="group">
                  <summary className="flex items-center justify-between gap-6 py-5 text-[17px] font-medium">
                    {it.q}
                    <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sv-tint text-sv-green">
                      <span className="relative h-3 w-3">
                        <span className="absolute inset-x-0 top-1/2 h-[1.5px] -translate-y-1/2 bg-current" />
                        <span className="absolute inset-y-0 left-1/2 w-[1.5px] -translate-x-1/2 bg-current transition-transform duration-200 group-open:scale-y-0" />
                      </span>
                    </span>
                  </summary>
                  <p className="-mt-1 max-w-2xl pb-6 leading-relaxed text-sv-slate">{it.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── CONTACT ── the form is the only way in: it lands in the admin pipeline and emails the team */}
        <section id="contact" aria-labelledby="sv-contact" className="scroll-mt-16 bg-white py-20 md:py-28">
          <div className="mx-auto max-w-2xl px-5 sm:px-8">
            <div className="text-center">
              <Label>{c.contact.kicker}</Label>
              <h2 id="sv-contact" className="sv-h2 mt-3">{c.contact.title}</h2>
              <p className="mt-4 text-lg text-sv-slate">{c.contact.sub}</p>
            </div>
            <div className="mt-10"><LeadForm /></div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
