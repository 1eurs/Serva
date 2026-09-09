import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../lib/i18n';
import { ensureGoogleFonts } from '../../lib/fonts';
import type { Lang } from '../../lib/types';
import { SiteFooter } from './SiteFooter';
import LeadForm from './LeadForm';
import './site.css';

/* ─────────────────────────────────────────────────────────────────────────
   Serva — neo-brutalist marketing landing (bilingual AR/EN, RTL-aware).
   Text-only: no illustrations or icon art — the visual interest comes purely
   from typography, color blocks, hard borders, shadows and oversized numerals.
   The whole page lives under <div id="neo">, the scope Tailwind is confined to
   (tailwind.config.js: important:'#neo', preflight off), so none of these
   utilities can leak onto the customer / dashboard / admin apps.
   ───────────────────────────────────────────────────────────────────────── */

const WHATSAPP_NUMBERS = ['96896603044', '96895237735'] as const;
const WHATSAPP_NUMBER = WHATSAPP_NUMBERS[Math.floor(Math.random() * WHATSAPP_NUMBERS.length)];
const waLink = (msg: string) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;

/* ── parallel AR / EN content ────────────────────────────────────────────── */
type Plan = {
  name: string; price: string; per: string; tagline: string;
  features: string[]; featured?: boolean; badge?: string;
};
type Copy = {
  dir: 'rtl' | 'ltr'; arrow: string; topbar: string;
  nav: { features: string; pricing: string; how: string; faq: string; cta: string; login: string };
  ticker: string[];
  hero: {
    badge: string; k1: string; k2: string; k3: string;
    sub: string; cta1: string; cta2: string; trust: string;
  };
  stats: { value: string; label: string }[];
  pillarsHead: { kicker: string; title: string; sub: string };
  pillars: { title: string; blurb: string }[];
  value: { kicker: string; title: string; points: string[]; color: string }[];
  how: { kicker: string; title: string; steps: { t: string; d: string }[] };
  pricing: { kicker: string; title: string; sub: string; setup: string; plans: Plan[]; cta: string; note: string };
  faq: { kicker: string; title: string; items: { q: string; a: string }[] };
  cta: { title: string; sub: string; btn: string };
  footer: { tagline: string; made: string; rights: string; links: string[] };
};

const COPY: Record<Lang, Copy> = {
  en: {
    dir: 'ltr', arrow: '→',
    topbar: 'Now live in Oman — one-time 50 OMR setup, go live this week.',
    nav: { features: 'Features', pricing: 'Pricing', how: 'How it works', faq: 'FAQ', cta: 'Get started', login: 'Log in' },
    ticker: ['POS', 'ONLINE ORDERING', 'LOYALTY', 'ANALYTICS', 'CUSTOMER DATA', 'ONE PLATFORM'],
    hero: {
      badge: 'The platform for modern cafés & restaurants',
      k1: 'Serve faster.', k2: 'Run smarter.', k3: 'Grow bigger.',
      sub: 'POS, online ordering, loyalty, analytics, and customer data — unified in one secure cloud platform, with new solutions shipping all the time. Serva gives your team one place to move faster, decide smarter, and scale without the chaos.',
      cta1: 'Get started on WhatsApp', cta2: 'See pricing',
      trust: 'Trusted by cafés & restaurants in Oman',
    },
    stats: [
      { value: '1', label: 'platform, one login' },
      { value: '0', label: 'extra hardware' },
      { value: '24/7', label: 'cloud access' },
      { value: '100%', label: 'your data & customers' },
    ],
    pillarsHead: { kicker: 'Everything in one place', title: 'One platform. No more stitched-together tools.', sub: 'Replace the patchwork of disconnected apps with one platform that runs your whole operation — and keeps adding the tools you grow into.' },
    pillars: [
      { title: 'Point of sale', blurb: 'A fast, no-fuss POS that keeps the counter moving.' },
      { title: 'Online ordering', blurb: 'QR & web ordering, with no app for your guests to install.' },
      { title: 'Loyalty', blurb: 'Reward your regulars and turn first visits into habits.' },
      { title: 'Analytics', blurb: 'See what sells and decide with real numbers, not guesses.' },
      { title: 'Customer data', blurb: 'Own your customer relationships — they’re yours, not a delivery app’s.' },
    ],
    value: [
      { kicker: 'Serve faster', title: 'Take orders everywhere', color: 'bg-neo-accent', points: ['QR & web ordering with zero app friction', 'Fast counter POS for walk-ins', 'Upsells and modifiers built into the flow'] },
      { kicker: 'Run smarter', title: 'Turn visits into regulars', color: 'bg-neo-secondary', points: ['Loyalty rewards that bring people back', 'Customer data you actually own', 'Know your regulars by name and order'] },
      { kicker: 'Grow bigger', title: 'Grow without the chaos', color: 'bg-neo-muted', points: ['Live analytics across every branch', 'Cloud access from any device', 'Add branches without adding headaches'] },
    ],
    how: {
      kicker: 'How it works', title: 'Live in days, not months.',
      steps: [
        { t: 'Get set up', d: 'A one-time 50 OMR setup and we configure everything for your venue — POS, menu, the lot.' },
        { t: 'Add menu & brand', d: 'Your items, photos, branches and branding. We help you import it fast.' },
        { t: 'Go live & grow', d: 'Start taking orders the same week and watch the numbers in real time.' },
      ],
    },
    pricing: {
      kicker: 'Pricing', title: 'Simple, honest pricing.', sub: 'Two plans. One-time setup. No surprises.',
      setup: '+ 50 OMR one-time setup',
      cta: 'Get started on WhatsApp',
      note: 'All prices in OMR. The 50 OMR setup is a one-time fee on both plans.',
      plans: [
        { name: 'Standard', price: '15', per: '/mo', tagline: 'Everything you need to start selling.', features: ['Point of sale', 'Online & QR ordering', 'Menu management', 'Basic analytics', 'Single branch', 'Email support'] },
        { name: 'Pro', price: '20', per: '/mo', tagline: 'Standard, plus the tools that scale.', featured: true, badge: 'Most popular', features: ['Everything in Standard', 'Loyalty program', 'Advanced analytics', 'Customer data tools', 'Multi-branch', 'Priority support'] },
      ],
    },
    faq: {
      kicker: 'FAQ', title: 'Questions, answered.',
      items: [
        { q: 'Is there a setup fee?', a: 'Yes — a one-time 50 OMR covers full onboarding and configuration, on both the Standard and Pro plans.' },
        { q: 'Do I need special hardware?', a: 'No. Serva is cloud-based and runs on any phone, tablet or computer you already have.' },
        { q: 'What’s the difference between Standard and Pro?', a: 'Pro includes everything in Standard, plus loyalty, advanced analytics, customer-data tools and multi-branch support.' },
        { q: 'Can I upgrade later?', a: 'Anytime. Move from Standard to Pro whenever you’re ready — no second setup fee.' },
      ],
    },
    cta: { title: 'Serve faster. Run smarter. Grow bigger.', sub: 'Leave your details and we’ll call you back within one working day — or message us on WhatsApp and we’ll take it from there.', btn: 'Get started on WhatsApp' },
    footer: { tagline: 'Your whole operation, one platform.', made: 'Built in Oman', rights: 'All rights reserved.', links: ['Features', 'Pricing', 'How it works', 'FAQ'] },
  },
  ar: {
    dir: 'rtl', arrow: '←',
    topbar: 'متوفّرة الآن في عُمان — تهيئة لمرة واحدة بـ 50 ر.ع، وانطلق هذا الأسبوع.',
    nav: { features: 'المميزات', pricing: 'الأسعار', how: 'كيف تعمل', faq: 'الأسئلة', cta: 'ابدأ الآن', login: 'تسجيل الدخول' },
    ticker: ['نقاط البيع', 'الطلب أونلاين', 'الولاء', 'التحليلات', 'بيانات العملاء', 'منصة واحدة'],
    hero: {
      badge: 'منصّة متكاملة للمقاهي والمطاعم',
      k1: 'خدمة أسرع.', k2: 'إدارة أذكى.', k3: 'نموّ أكبر.',
      sub: 'نقاط البيع، الطلب أونلاين، الولاء، التحليلات، وبيانات العملاء — موحّدة في منصّة سحابية واحدة، مع حلول جديدة تصدر تباعاً. تمنح Serva فريقك مكاناً واحداً للعمل أسرع، واتخاذ قرارات أذكى، والتوسّع دون فوضى.',
      cta1: 'ابدأ عبر واتساب', cta2: 'شاهد الأسعار',
      trust: 'موثوقة لدى المقاهي والمطاعم في عُمان',
    },
    stats: [
      { value: '1', label: 'منصّة، دخول واحد' },
      { value: '0', label: 'أجهزة إضافية' },
      { value: '24/7', label: 'وصول سحابي' },
      { value: '100%', label: 'بياناتك وعملاؤك' },
    ],
    pillarsHead: { kicker: 'كل شيء في مكان واحد', title: 'منصّة واحدة. لا مزيد من الأدوات المتفرّقة.', sub: 'استبدل فوضى التطبيقات المتفرّقة بمنصّة واحدة تدير عملك بالكامل — وتضيف باستمرار الأدوات التي تنمو إليها.' },
    pillars: [
      { title: 'نقاط البيع', blurb: 'نظام بيع سريع وبسيط يبقي الكاونتر متحرّكاً.' },
      { title: 'الطلب أونلاين', blurb: 'طلب عبر QR والويب، دون تطبيق يثبّته ضيوفك.' },
      { title: 'برنامج الولاء', blurb: 'كافئ عملاءك الدائمين وحوّل أول زيارة إلى عادة.' },
      { title: 'التحليلات', blurb: 'اعرف ما الذي يُباع وقرّر بالأرقام لا بالتخمين.' },
      { title: 'بيانات العملاء', blurb: 'امتلك علاقتك بعملائك — هم لك، لا لتطبيق توصيل.' },
    ],
    value: [
      { kicker: 'خدمة أسرع', title: 'استقبل الطلبات من كل مكان', color: 'bg-neo-accent', points: ['طلب عبر QR والويب دون أي تطبيق', 'نقاط بيع سريعة للزبائن في الموقع', 'إضافات وعروض مدمجة في مسار الطلب'] },
      { kicker: 'إدارة أذكى', title: 'حوّل الزيارات إلى عملاء دائمين', color: 'bg-neo-secondary', points: ['مكافآت ولاء تُعيد الناس إليك', 'بيانات عملاء تملكها فعلاً', 'اعرف عملاءك بالاسم والطلب'] },
      { kicker: 'نموّ أكبر', title: 'كبّر عملك دون فوضى', color: 'bg-neo-muted', points: ['تحليلات لحظية لكل فرع', 'وصول سحابي من أي جهاز', 'أضف فروعاً دون صداع إضافي'] },
    ],
    how: {
      kicker: 'كيف تعمل', title: 'جاهز خلال أيام، لا شهور.',
      steps: [
        { t: 'جهّز حسابك', d: 'رسوم تهيئة لمرة واحدة بـ 50 ر.ع ونضبط لك كل شيء — نقاط البيع والقائمة وغيرها.' },
        { t: 'أضف القائمة والهوية', d: 'أصنافك وصورك وفروعك وهويّتك. نساعدك على استيرادها بسرعة.' },
        { t: 'انطلق وانمُ', d: 'ابدأ استقبال الطلبات في نفس الأسبوع وتابع الأرقام لحظياً.' },
      ],
    },
    pricing: {
      kicker: 'الأسعار', title: 'تسعير بسيط وصريح.', sub: 'خطتان. تهيئة لمرة واحدة. دون مفاجآت.',
      setup: '+ 50 ر.ع تهيئة لمرة واحدة',
      cta: 'ابدأ عبر واتساب',
      note: 'جميع الأسعار بالريال العُماني. رسوم التهيئة 50 ر.ع لمرة واحدة على كلتا الخطتين.',
      plans: [
        { name: 'ستاندرد', price: '15', per: '/شهر', tagline: 'كل ما تحتاجه لتبدأ البيع.', features: ['نقاط البيع', 'طلب أونلاين وعبر QR', 'إدارة القائمة', 'تحليلات أساسية', 'فرع واحد', 'دعم بالبريد'] },
        { name: 'برو', price: '20', per: '/شهر', tagline: 'ستاندرد، مع أدوات تكبّر عملك.', featured: true, badge: 'الأكثر طلباً', features: ['كل مزايا ستاندرد', 'برنامج الولاء', 'تحليلات متقدّمة', 'أدوات بيانات العملاء', 'فروع متعدّدة', 'دعم أولوية'] },
      ],
    },
    faq: {
      kicker: 'الأسئلة الشائعة', title: 'إجابات على أسئلتك.',
      items: [
        { q: 'هل هناك رسوم تهيئة؟', a: 'نعم — رسوم لمرة واحدة بقيمة 50 ر.ع تغطّي التهيئة والإعداد الكامل، على خطّتي ستاندرد وبرو.' },
        { q: 'هل أحتاج أجهزة خاصة؟', a: 'لا. Serva سحابية وتعمل على أي هاتف أو جهاز لوحي أو حاسوب لديك بالفعل.' },
        { q: 'ما الفرق بين ستاندرد وبرو؟', a: 'تشمل برو كل ما في ستاندرد، مع الولاء والتحليلات المتقدّمة وأدوات بيانات العملاء ودعم الفروع المتعدّدة.' },
        { q: 'هل يمكنني الترقية لاحقاً؟', a: 'في أي وقت. انتقل من ستاندرد إلى برو متى شئت — دون رسوم تهيئة جديدة.' },
      ],
    },
    cta: { title: 'خدمة أسرع. إدارة أذكى. نموّ أكبر.', sub: 'اترك بياناتك وسنتصل بك خلال يوم عمل واحد — أو راسلنا عبر واتساب ونتولّى الباقي.', btn: 'ابدأ عبر واتساب' },
    footer: { tagline: 'عملك بالكامل، في منصّة واحدة.', made: 'صُنع في عُمان', rights: 'جميع الحقوق محفوظة.', links: ['المميزات', 'الأسعار', 'كيف تعمل', 'الأسئلة'] },
  },
};

/* ── reusable bits ───────────────────────────────────────────────────────── */
function Cta({ href, children, arrow, variant = 'accent', className = '', onClick }: {
  href: string; children: ReactNode; arrow: string;
  variant?: 'accent' | 'dark' | 'white' | 'secondary'; className?: string;
  /** In-page links inside the mobile menu use this to close it on the way out. */
  onClick?: () => void;
}) {
  const bg = {
    accent: 'bg-neo-accent text-black',
    secondary: 'bg-neo-secondary text-black',
    white: 'bg-white text-black',
    dark: 'bg-black text-white',
  }[variant];
  const external = href.startsWith('http');
  return (
    <a
      href={href}
      onClick={onClick}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={`inline-flex h-14 items-center justify-center gap-2 border-4 border-black px-7 text-sm font-bold uppercase tracking-wide shadow-neo-sm transition-all duration-100 hover:-translate-y-0.5 hover:shadow-neo active:translate-x-[3px] active:translate-y-[3px] active:shadow-none ${bg} ${className}`}
    >
      {children}
      <span aria-hidden="true" className="text-lg font-black leading-none">{arrow}</span>
    </a>
  );
}

function Kicker({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-block -rotate-1 border-4 border-black bg-neo-accent px-3 py-1 text-xs font-black uppercase tracking-widest shadow-neo-sm ${className}`}>
      {children}
    </span>
  );
}

/* check glyph marker (a text "✓" in a bordered box — no icon art) */
function Tick({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center border-2 border-black text-sm font-black leading-none ${className}`}>✓</span>
  );
}

function Marquee({ items }: { items: string[] }) {
  const row = (
    <div className="flex shrink-0 items-center">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-6 whitespace-nowrap px-6 text-lg font-black uppercase tracking-widest text-neo-accent md:text-2xl">
          {it}
          <span aria-hidden="true" className="text-neo-accent">✦</span>
        </span>
      ))}
    </div>
  );
  return (
    <div className="overflow-hidden border-y-4 border-black bg-black py-3" dir="ltr" aria-hidden="true">
      <div className="neo-marquee-track">
        {row}{row}
      </div>
    </div>
  );
}

/* ── page ────────────────────────────────────────────────────────────────── */
export default function LandingPage() {
  const { lang, dir } = useI18n();
  const c = COPY[lang];
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    ensureGoogleFonts(['Space+Grotesk:wght@400;500;700', 'Tajawal:wght@400;500;700;900']);
  }, []);

  const nav = [
    { href: '#features', label: c.nav.features },
    { href: '#how', label: c.nav.how },
    { href: '#pricing', label: c.nav.pricing },
    { href: '#faq', label: c.nav.faq },
  ];

  return (
    <div id="neo" dir={dir} className={lang === 'ar' ? 'lang-ar' : ''}>
      {/* ── ANNOUNCEMENT STRIP ──────────────────────────────── */}
      <div className="border-b-4 border-black bg-neo-accent">
        <div className="mx-auto flex h-9 max-w-7xl items-center justify-center gap-2 px-4 text-center text-[11px] font-black uppercase tracking-widest text-black sm:text-xs">
          <span aria-hidden="true" className="hidden sm:inline">★</span>
          {c.topbar}
        </div>
      </div>

      {/* ── NAV ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b-4 border-black bg-neo-bg">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href="#top" className="group flex items-center text-2xl font-black tracking-tighter">
            <span className="flex h-11 items-center border-4 border-black bg-neo-accent px-3 text-black shadow-neo-sm transition-transform duration-100 group-hover:-translate-y-0.5">
              SERVA
            </span>
          </a>

          <nav className="hidden items-center gap-1 lg:flex">
            {nav.map((n) => (
              <a key={n.href} href={n.href}
                className="border-4 border-transparent px-3 py-1.5 text-sm font-bold uppercase tracking-wide transition-all duration-100 hover:-translate-y-0.5 hover:border-black hover:bg-neo-accent hover:shadow-neo-sm">
                {n.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2.5">
            <Link to="/dashboard"
              className="hidden h-12 items-center justify-center border-4 border-black bg-white px-5 text-sm font-bold uppercase tracking-wide shadow-neo-sm transition-all duration-100 hover:-translate-y-0.5 hover:bg-neo-accent hover:shadow-neo active:translate-x-[2px] active:translate-y-[2px] active:shadow-none sm:inline-flex">
              {c.nav.login}
            </Link>
            <Cta href="#start" arrow={c.arrow} className="hidden h-12 md:inline-flex">{c.nav.cta}</Cta>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Menu" aria-expanded={menuOpen}
              className="flex h-12 w-12 items-center justify-center border-4 border-black bg-white shadow-neo-sm transition-all duration-100 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none lg:hidden">
              <div className="space-y-1.5">
                <span className="block h-1 w-6 bg-black" />
                <span className="block h-1 w-6 bg-black" />
                <span className="block h-1 w-6 bg-black" />
              </div>
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="border-t-4 border-black bg-neo-bg p-4 lg:hidden">
            <div className="flex flex-col gap-2">
              {nav.map((n) => (
                <a key={n.href} href={n.href} onClick={() => setMenuOpen(false)}
                  className="border-4 border-black bg-white px-4 py-3 text-base font-bold uppercase tracking-wide shadow-neo-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none">
                  {n.label}
                </a>
              ))}
              <Link to="/dashboard" onClick={() => setMenuOpen(false)}
                className="border-4 border-black bg-white px-4 py-3 text-base font-bold uppercase tracking-wide shadow-neo-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none">
                {c.nav.login}
              </Link>
              <Cta href="#start" onClick={() => setMenuOpen(false)} arrow={c.arrow} className="mt-1 w-full">{c.nav.cta}</Cta>
            </div>
          </div>
        )}
      </header>

      <main id="top">
        {/* ── HERO (pure typography) ────────────────────────── */}
        <section className="relative overflow-hidden border-b-4 border-black">
          <div className="neo-dots pointer-events-none absolute inset-0 opacity-[0.15]" aria-hidden="true" />
          {/* oversized faint wordmark = typographic texture, not an illustration */}
          <span aria-hidden="true" className="neo-stroke pointer-events-none absolute -bottom-10 end-[-2%] select-none text-[28vw] font-black uppercase leading-none opacity-[0.07] md:text-[22vw]">
            serva
          </span>

          <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-28">
            <Kicker>★ {c.hero.badge}</Kicker>

            <h1 className="mt-7 font-black uppercase leading-[0.86] tracking-tighter">
              <span className="block text-6xl sm:text-7xl md:text-8xl xl:text-9xl">
                <span className="inline-block rotate-1 border-4 border-black bg-neo-accent px-3 shadow-neo">{c.hero.k1}</span>
              </span>
              <span className="mt-3 block text-6xl sm:text-7xl md:text-8xl xl:text-9xl">
                <span className="inline-block border-b-8 border-neo-accent">{c.hero.k2}</span>
              </span>
              <span className="neo-stroke mt-3 block text-6xl sm:text-7xl md:text-8xl xl:text-9xl">{c.hero.k3}</span>
            </h1>

            <p className="mt-9 max-w-2xl text-lg font-medium leading-relaxed text-black/80 sm:text-xl">
              {c.hero.sub}
            </p>

            {/* capability tags — current solutions, plus a nod to what's shipping next */}
            <div className="mt-7 flex flex-wrap gap-2">
              {c.pillars.map((p, i) => (
                <span key={i} className="border-4 border-black bg-white px-3 py-1.5 text-xs font-black uppercase tracking-wide shadow-neo-sm">
                  {p.title}
                </span>
              ))}
              <span className="border-4 border-dashed border-black bg-neo-accent/20 px-3 py-1.5 text-xs font-black uppercase tracking-wide">
                {lang === 'ar' ? '+ المزيد قريباً' : '+ more coming'}
              </span>
            </div>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Cta href={waLink(c.hero.cta1)} arrow={c.arrow}>{c.hero.cta1}</Cta>
              <Cta href="#pricing" arrow={c.arrow} variant="white">{c.hero.cta2}</Cta>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <span aria-hidden="true" className="text-2xl leading-none tracking-tight text-neo-accent">★★★★★</span>
              <span className="text-sm font-bold uppercase tracking-wide">{c.hero.trust}</span>
            </div>
          </div>

          {/* stat strip */}
          <div className="relative border-t-4 border-black bg-neo-accent">
            <div className="mx-auto grid max-w-7xl grid-cols-2 md:grid-cols-4">
              {c.stats.map((s, i) => (
                <div key={i} className={`px-5 py-7 text-center ${i % 2 === 1 ? 'border-s-4 border-black' : ''} ${i >= 2 ? 'border-t-4 border-black md:border-t-0' : ''} ${i % 4 !== 0 ? 'md:border-s-4 md:border-black' : ''}`}>
                  <div className="text-4xl font-black tracking-tighter md:text-5xl">{s.value}</div>
                  <div className="mt-1 text-xs font-bold uppercase tracking-widest text-black/70">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Marquee items={c.ticker} />

        {/* ── PILLARS (numbered, text-only) ─────────────────── */}
        <section id="features" className="scroll-mt-24 border-b-4 border-black py-20 md:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="max-w-3xl">
              <Kicker>{c.pillarsHead.kicker}</Kicker>
              <h2 className="mt-5 text-4xl font-black uppercase leading-[0.95] tracking-tighter md:text-6xl">{c.pillarsHead.title}</h2>
              <p className="mt-5 text-lg font-medium text-black/80 md:text-xl">{c.pillarsHead.sub}</p>
            </div>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {c.pillars.map((p, i) => {
                const tones = ['bg-neo-accent', 'bg-neo-accent', 'bg-neo-accent', 'bg-neo-accent', 'bg-neo-accent'];
                return (
                  <div key={i} className="border-4 border-black bg-white p-6 shadow-neo transition-all duration-200 hover:-translate-y-2 hover:shadow-neo-lg">
                    <div className={`flex h-14 w-14 items-center justify-center border-4 border-black ${tones[i]} text-2xl font-black shadow-neo-sm`}>
                      {String(i + 1).padStart(2, '0')}
                    </div>
                    <h3 className="mt-5 text-2xl font-black uppercase tracking-tight">{p.title}</h3>
                    <p className="mt-2 text-base font-medium leading-relaxed text-black/75">{p.blurb}</p>
                  </div>
                );
              })}
              {/* 6th cell: CTA tile */}
              <a href={waLink(c.cta.btn)} target="_blank" rel="noopener noreferrer"
                className="group flex flex-col justify-between border-4 border-black bg-black p-6 text-white shadow-neo transition-all duration-200 hover:-translate-y-2 hover:shadow-neo-white">
                <span className="text-5xl font-black tracking-tighter text-neo-accent">+</span>
                <div className="mt-6">
                  <h3 className="text-2xl font-black uppercase tracking-tight">{c.nav.cta}</h3>
                  <span className="mt-2 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-neo-accent">
                    {c.hero.cta1} <span aria-hidden="true">{c.arrow}</span>
                  </span>
                </div>
              </a>
            </div>
          </div>
        </section>

        {/* ── VALUE ROWS ────────────────────────────────────── */}
        <section className="border-b-4 border-black bg-neo-accent/15 py-20 md:py-28">
          <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 sm:px-6">
            {c.value.map((v, i) => (
              <div key={i} className="grid items-center gap-8 border-4 border-black bg-neo-bg p-7 shadow-neo md:p-10 lg:grid-cols-[0.9fr_1.1fr]">
                <div className={i % 2 === 1 ? 'lg:order-2' : ''}>
                  <span className="inline-block border-4 border-black bg-neo-accent px-3 py-1 text-xs font-black uppercase tracking-widest shadow-neo-sm">
                    {v.kicker}
                  </span>
                  <h3 className="mt-4 text-3xl font-black uppercase leading-[0.95] tracking-tighter md:text-5xl">{v.title}</h3>
                </div>
                <ul className={`grid gap-3 ${i % 2 === 1 ? 'lg:order-1' : ''}`}>
                  {v.points.map((pt, j) => (
                    <li key={j} className="flex items-center gap-3 border-4 border-black bg-white px-4 py-3.5 text-base font-bold shadow-neo-sm">
                      <Tick className="h-8 w-8 bg-neo-accent" />
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* ── HOW IT WORKS ──────────────────────────────────── */}
        <section id="how" className="scroll-mt-24 border-b-4 border-black py-20 md:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="max-w-3xl">
              <Kicker>{c.how.kicker}</Kicker>
              <h2 className="mt-5 text-4xl font-black uppercase leading-[0.95] tracking-tighter md:text-6xl">{c.how.title}</h2>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {c.how.steps.map((s, i) => (
                <div key={i} className="relative border-4 border-black bg-white p-7 shadow-neo">
                  <div className="absolute -top-6 start-6 flex h-14 w-14 items-center justify-center border-4 border-black bg-neo-accent text-2xl font-black text-white shadow-neo-sm">
                    {i + 1}
                  </div>
                  <h3 className="mt-6 text-2xl font-black uppercase tracking-tight">{s.t}</h3>
                  <p className="mt-2 text-base font-medium leading-relaxed text-black/75">{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── PRICING ───────────────────────────────────────── */}
        <section id="pricing" className="scroll-mt-24 border-b-4 border-black bg-neo-accent py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="text-center">
              <Kicker className="bg-white">{c.pricing.kicker}</Kicker>
              <h2 className="mt-5 text-4xl font-black uppercase leading-[0.95] tracking-tighter md:text-6xl">{c.pricing.title}</h2>
              <p className="mt-4 text-lg font-bold md:text-xl">{c.pricing.sub}</p>
            </div>
            <div className="mx-auto mt-12 grid max-w-4xl gap-8 md:grid-cols-2">
              {c.pricing.plans.map((plan, i) => (
                <div key={i}
                  className={`relative border-4 border-black p-8 transition-all duration-200 hover:-translate-y-2 ${plan.featured ? 'rotate-1 bg-black text-white shadow-neo-xl hover:shadow-neo-white-lg' : 'bg-white shadow-neo-lg hover:shadow-neo-xl'}`}>
                  {plan.badge && (
                    <span className="absolute -top-5 end-6 rotate-3 border-4 border-black bg-neo-accent px-3 py-1.5 text-xs font-black uppercase tracking-widest text-black shadow-neo-sm">
                      ★ {plan.badge}
                    </span>
                  )}
                  <h3 className={`text-2xl font-black uppercase tracking-tight ${plan.featured ? 'text-neo-accent' : ''}`}>{plan.name}</h3>
                  <p className={`mt-1 text-sm font-bold ${plan.featured ? 'text-white/70' : 'text-black/70'}`}>{plan.tagline}</p>
                  <div className="mt-6 flex items-end gap-1">
                    <span className="text-6xl font-black tracking-tighter md:text-7xl">{plan.price}</span>
                    <span className="pb-2 text-xl font-black">OMR</span>
                    <span className={`pb-2.5 text-sm font-bold ${plan.featured ? 'text-white/60' : 'text-black/60'}`}>{plan.per}</span>
                  </div>
                  <div className={`mt-2 inline-block border-2 border-dashed px-2 py-1 text-xs font-black uppercase tracking-wide ${plan.featured ? 'border-white/50 text-neo-accent' : 'border-black/40 text-black/70'}`}>
                    {c.pricing.setup}
                  </div>
                  <ul className="mt-6 space-y-3">
                    {plan.features.map((f, j) => (
                      <li key={j} className="flex items-center gap-3 text-base font-bold">
                        <Tick className="bg-neo-accent text-black" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Cta href={waLink(`${c.pricing.cta} — ${plan.name}`)} arrow={c.arrow}
                    variant={plan.featured ? 'white' : 'accent'} className="mt-8 w-full">
                    {c.pricing.cta}
                  </Cta>
                </div>
              ))}
            </div>
            <p className="mx-auto mt-8 max-w-2xl text-center text-sm font-bold text-black/70">{c.pricing.note}</p>
          </div>
        </section>

        {/* ── FAQ ───────────────────────────────────────────── */}
        <section id="faq" className="scroll-mt-24 border-b-4 border-black py-20 md:py-28">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <div className="text-center">
              <Kicker>{c.faq.kicker}</Kicker>
              <h2 className="mt-5 text-4xl font-black uppercase leading-[0.95] tracking-tighter md:text-6xl">{c.faq.title}</h2>
            </div>
            <div className="mt-10 space-y-4">
              {c.faq.items.map((it, i) => (
                <details key={i} className="group border-4 border-black bg-white shadow-neo-sm open:shadow-neo">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-lg font-black uppercase tracking-tight">
                    {it.q}
                    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-black bg-neo-accent text-2xl leading-none transition-transform duration-200 group-open:rotate-45">+</span>
                  </summary>
                  <div className="border-t-4 border-black bg-neo-accent/10 p-5 text-base font-medium leading-relaxed">
                    {it.a}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA BAND ──────────────────────────────────────── */}
        <section id="start" className="scroll-mt-24 relative overflow-hidden border-b-4 border-black bg-neo-accent py-20 md:py-28">
          <div className="neo-diag pointer-events-none absolute inset-0 opacity-[0.08]" aria-hidden="true" />
          <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6">
            <h2 className="text-4xl font-black uppercase leading-[0.95] tracking-tighter text-[#15181c] md:text-6xl" style={{ textShadow: '4px 4px 0 #fafaf7' }}>
              {c.cta.title}
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg font-bold text-[#15181c] md:text-xl">{c.cta.sub}</p>
            <div className="mt-9">
              <LeadForm waHref={waLink(c.cta.btn)} />
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
