import { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useI18n } from '../../lib/i18n';
import { ensureGoogleFonts } from '../../lib/fonts';
import { SiteFooter } from './SiteFooter';
import {
  COMPANY, LEGAL, LEGAL_LABELS, LEGAL_ORDER, LEGAL_UI, LEGAL_UPDATED,
  type LegalSlug,
} from './legal';
import './site.css';

function isSlug(s: string | undefined): s is LegalSlug {
  return !!s && (LEGAL_ORDER as string[]).includes(s);
}

export default function LegalPage() {
  const { slug } = useParams();
  const { lang, dir } = useI18n();

  useEffect(() => {
    ensureGoogleFonts(['Space+Grotesk:wght@400;500;700', 'Tajawal:wght@400;500;700;900']);
    window.scrollTo(0, 0);
  }, [slug]);

  if (!isSlug(slug)) return <Navigate to="/legal/privacy" replace />;

  const ui = LEGAL_UI[lang];
  const doc = LEGAL[lang][slug];
  // bidi-ok: locale-native date, already correct in both directions.
  const updated = new Date(LEGAL_UPDATED).toLocaleDateString(lang === 'ar' ? 'ar-OM' : 'en-GB', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div id="neo" dir={dir} className={lang === 'ar' ? 'lang-ar' : ''}>
      {/* top bar */}
      <header className="sticky top-0 z-50 border-b-4 border-black bg-neo-bg">
        <div className="mx-auto flex h-20 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center text-2xl font-black tracking-tighter">
            <span className="flex h-11 items-center border-4 border-black bg-neo-accent px-3 text-black shadow-neo-sm">SERVA</span>
          </Link>
          <Link to="/"
            className="inline-flex h-11 items-center gap-2 border-4 border-black bg-white px-4 text-sm font-bold uppercase tracking-wide shadow-neo-sm transition-all duration-100 hover:-translate-y-0.5 hover:shadow-neo active:translate-x-[2px] active:translate-y-[2px] active:shadow-none">
            <span aria-hidden="true">{lang === 'ar' ? '→' : '←'}</span> {ui.back}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
        {/* doc tabs */}
        <nav aria-label={ui.legal} className="flex flex-wrap gap-2">
          {LEGAL_ORDER.map((s) => {
            const active = s === slug;
            return (
              <Link key={s} to={`/legal/${s}`}
                className={`border-4 border-black px-3 py-1.5 text-xs font-black uppercase tracking-wide transition-all duration-100 hover:-translate-y-0.5 ${active ? 'bg-neo-accent text-black shadow-neo-sm' : 'bg-white text-black hover:shadow-neo-sm'}`}>
                {LEGAL_LABELS[lang][s]}
              </Link>
            );
          })}
        </nav>

        {/* heading */}
        <div className="mt-8">
          <h1 className="text-4xl font-black uppercase leading-[0.95] tracking-tighter md:text-6xl">{doc.title}</h1>
          <span className="mt-4 inline-block -rotate-1 border-4 border-black bg-neo-accent px-3 py-1 text-xs font-black uppercase tracking-widest shadow-neo-sm">
            {ui.updated}: {updated}
          </span>
        </div>

        {/* body card */}
        <article className="mt-8 border-4 border-black bg-white p-6 shadow-neo md:p-10">
          <p className="text-lg font-bold leading-relaxed">{doc.intro}</p>

          <div className="mt-8 space-y-9">
            {doc.sections.map((sec, i) => (
              <section key={i}>
                <h2 className="flex items-baseline gap-3 text-xl font-black uppercase tracking-tight md:text-2xl">
                  <span className="text-neo-accent">{String(i + 1).padStart(2, '0')}</span>
                  {sec.h}
                </h2>
                {sec.body.length > 1 ? (
                  <ul className="mt-3 space-y-2">
                    {sec.body.map((b, j) => (
                      <li key={j} className="flex gap-3 text-base font-medium leading-relaxed text-black/85">
                        <span aria-hidden="true" className="mt-2 h-2.5 w-2.5 shrink-0 border-2 border-black bg-neo-accent" />
                        {b}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-base font-medium leading-relaxed text-black/85">{sec.body[0]}</p>
                )}
              </section>
            ))}
          </div>

          <p className="mt-9 border-t-4 border-black pt-5 text-sm font-bold text-black/60">{ui.disclaimer}</p>
        </article>

        {/* contact strip */}
        <div className="mt-8 flex flex-col items-start justify-between gap-4 border-4 border-black bg-neo-accent/10 p-6 shadow-neo-sm sm:flex-row sm:items-center">
          <span className="text-lg font-black uppercase tracking-tight">{ui.needHelp}</span>
          <a href={`mailto:${COMPANY.email}`}
            className="inline-flex h-12 items-center gap-2 border-4 border-black bg-neo-accent px-6 text-sm font-bold uppercase tracking-wide text-black shadow-neo-sm transition-all duration-100 hover:-translate-y-0.5 hover:shadow-neo active:translate-x-[2px] active:translate-y-[2px] active:shadow-none">
            {ui.contactCta} <span aria-hidden="true">{lang === 'ar' ? '←' : '→'}</span>
          </a>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
