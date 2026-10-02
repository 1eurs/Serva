import { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useI18n } from '../../lib/i18n';
import { ensureGoogleFonts } from '../../lib/fonts';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';
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
    ensureGoogleFonts(['Sora:wght@500;600;700', 'IBM+Plex+Sans:wght@400;500;600']);
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
      <SiteHeader back={ui.back} />

      <main className="mx-auto max-w-4xl px-5 py-12 sm:px-8 md:py-16">
        {/* doc tabs */}
        <nav aria-label={ui.legal} className="flex flex-wrap gap-2">
          {LEGAL_ORDER.map((s) => {
            const active = s === slug;
            return (
              <Link key={s} to={`/legal/${s}`} aria-current={active ? 'page' : undefined}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${active ? 'bg-sv-ink text-white' : 'bg-sv-mist text-sv-slate hover:text-sv-ink'}`}>
                {LEGAL_LABELS[lang][s]}
              </Link>
            );
          })}
        </nav>

        {/* heading */}
        <div className="mt-10">
          <h1 className="sv-h2">{doc.title}</h1>
          <p className="mt-3 text-sm text-sv-slate">{ui.updated}: {updated}</p>
        </div>

        {/* body */}
        <article className="mt-10 border-t border-sv-line pt-10">
          <p className="text-lg leading-relaxed text-sv-ink">{doc.intro}</p>

          <div className="mt-10 space-y-10">
            {doc.sections.map((sec, i) => (
              <section key={i}>
                <h2 className="flex items-baseline gap-3 text-xl font-semibold">
                  <span className="font-mono text-sm font-medium text-sv-green tnum">{String(i + 1).padStart(2, '0')}</span>
                  {sec.h}
                </h2>
                {sec.body.length > 1 ? (
                  <ul className="mt-3 space-y-2">
                    {sec.body.map((b, j) => (
                      <li key={j} className="flex gap-3 leading-relaxed text-sv-slate">
                        <span aria-hidden="true" className="mt-[0.7em] h-1.5 w-1.5 shrink-0 rounded-full bg-sv-green" />
                        {b}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 leading-relaxed text-sv-slate">{sec.body[0]}</p>
                )}
              </section>
            ))}
          </div>

          <p className="mt-12 border-t border-sv-line pt-5 text-sm text-sv-slate">{ui.disclaimer}</p>
        </article>

        {/* contact strip */}
        <div className="mt-10 flex flex-col items-start justify-between gap-4 rounded-2xl bg-sv-mist p-6 sm:flex-row sm:items-center">
          <span className="text-lg font-semibold">{ui.needHelp}</span>
          <a href={`mailto:${COMPANY.email}`}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-sv-green px-5 text-sm font-medium text-white transition-colors hover:bg-sv-deep">
            {ui.contactCta} <span aria-hidden="true">{lang === 'ar' ? '←' : '→'}</span>
          </a>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
