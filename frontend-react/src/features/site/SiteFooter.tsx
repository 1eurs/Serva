import { Link } from 'react-router-dom';
import { Ltr, useI18n } from '../../lib/i18n';
import type { Lang } from '../../lib/types';
import { COMPANY, LEGAL_LABELS, LEGAL_ORDER } from './legal';
import { Logo, LangSwitch } from './SiteHeader';

/* Shared footer for the marketing + legal pages. Holds the legal links, the
   business details an Omani site must display (CR / contact / address / OMR),
   and the AR/EN toggle. Night-ink surface: on the landing it follows the day's
   close, and on the lighter pages it anchors the bottom. */

const F: Record<Lang, {
  tagline: string; product: string; legal: string; company: string;
  cr: string; vat: string; made: string; rights: string;
  links: { features: string; setup: string; pricing: string; faq: string; analytics: string };
}> = {
  en: {
    tagline: 'POS, ordering and loyalty for cafés, restaurants and food trucks.',
    product: 'Product', legal: 'Legal', company: 'Company',
    cr: 'CR No.', vat: 'All prices in OMR.', made: 'Built in Oman',
    rights: 'All rights reserved.',
    links: { features: 'Features', setup: 'How it works', pricing: 'Pricing', faq: 'FAQ', analytics: 'Analytics guide' },
  },
  ar: {
    tagline: 'نقاط البيع والطلبات والولاء للمقاهي والمطاعم وعربات الطعام.',
    product: 'المنتج', legal: 'قانوني', company: 'الشركة',
    cr: 'سجل تجاري', vat: 'جميع الأسعار بالريال العُماني.', made: 'صُنع في عُمان',
    rights: 'جميع الحقوق محفوظة.',
    links: { features: 'المزايا', setup: 'كيف نبدأ', pricing: 'الأسعار', faq: 'الأسئلة', analytics: 'دليل التحليلات' },
  },
};

/** `links` replaces the Product column, for a page whose sections differ from the landing's. */
export function SiteFooter({ links }: { links?: { href: string; label: string }[] } = {}) {
  const { lang } = useI18n();
  const f = F[lang];
  const product = links ?? [
    { href: '/#features', label: f.links.features },
    { href: '/#setup', label: f.links.setup },
    { href: '/#pricing', label: f.links.pricing },
    { href: '/#faq', label: f.links.faq },
    { href: '/guide/analytics', label: f.links.analytics },
  ];
  // Mono caps are for Latin only — Plex Mono has no Arabic glyphs.
  const head = lang === 'ar' ? 'text-sm font-semibold text-white/45' : 'font-mono text-xs font-medium uppercase tracking-[0.16em] text-white/45';
  const link = 'text-sm text-white/75 transition-colors hover:text-white';

  return (
    <footer className="bg-sv-ink text-white">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <div className="grid gap-12 md:grid-cols-[1.5fr_1fr_1fr_1.3fr]">
          <div>
            <Logo tone="white" />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-white/60">{f.tagline}</p>
          </div>

          <nav aria-label={f.product}>
            <h3 className={head}>{f.product}</h3>
            <ul className="mt-5 space-y-3">
              {product.map((p) => (
                <li key={p.href}><a href={p.href} className={link}>{p.label}</a></li>
              ))}
            </ul>
          </nav>

          <nav aria-label={f.legal}>
            <h3 className={head}>{f.legal}</h3>
            <ul className="mt-5 space-y-3">
              {LEGAL_ORDER.map((slug) => (
                <li key={slug}><Link to={`/legal/${slug}`} className={link}>{LEGAL_LABELS[lang][slug]}</Link></li>
              ))}
            </ul>
          </nav>

          {/* business details (required for an Omani online business) */}
          <div>
            <h3 className={head}>{f.company}</h3>
            <ul className="mt-5 space-y-2 text-sm text-white/60">
              <li className="font-medium text-white/85">{COMPANY.legalName[lang]}</li>
              <li>{f.cr} <span className="tnum"><Ltr>{COMPANY.cr}</Ltr></span></li>
              <li>{COMPANY.address[lang]}</li>
              <li><a href={`mailto:${COMPANY.email}`} className="hover:text-white"><Ltr>{COMPANY.email}</Ltr></a></li>
              <li className="pt-1 text-xs text-white/45">{f.vat}</li>
            </ul>
          </div>
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-6 text-sm text-white/50 sm:flex-row sm:items-center">
          <span>© <span className="tnum">{new Date().getFullYear()}</span> {COMPANY.brand}. {f.rights}</span>
          <div className="flex items-center gap-4">
            <span>{f.made}</span>
            <LangSwitch className="border border-white/15 text-white hover:bg-white/10" />
          </div>
        </div>
      </div>
    </footer>
  );
}
