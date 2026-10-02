import { useId } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../lib/i18n';

/* Brand pieces shared by the landing, legal and guide pages. The mark is the
   favicon's "S." drawn inline, so it stays sharp and needs no request. */

export function Logo({ tone = 'ink' }: { tone?: 'ink' | 'white' }) {
  // The header and footer both draw the mark; each needs its own gradient id.
  const grad = useId().replace(/:/g, '');
  return (
    <span className="inline-flex items-center gap-2.5" dir="ltr" translate="no">
      <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
        <defs>
          <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#34e2a4" />
            <stop offset="1" stopColor="#047857" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="8" fill={`url(#${grad})`} />
        <text x="14" y="23.5" textAnchor="middle" fontFamily="Sora, system-ui, sans-serif" fontSize="22" fontWeight="700" fill="#fff">S</text>
        <circle cx="24" cy="22.6" r="2.5" fill="#fff" />
      </svg>
      <span className={`font-display text-[21px] font-semibold tracking-[-0.03em] ${tone === 'white' ? 'text-white' : 'text-sv-ink'}`}>
        Serva
      </span>
    </span>
  );
}

/** Names the *other* language in its own script — the reader looking for it can read it. */
export function LangSwitch({ className = '' }: { className?: string }) {
  const { lang, setLang } = useI18n();
  const next = lang === 'ar' ? 'en' : 'ar';
  return (
    <button
      type="button"
      onClick={() => setLang(next)}
      lang={next}
      className={`inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium transition-colors ${className}`}
    >
      {next === 'ar' ? 'العربية' : 'English'}
    </button>
  );
}

/** The slim bar for the legal and guide pages: brand home, language, and a way back. */
export function SiteHeader({ back }: { back: string }) {
  const { lang } = useI18n();
  return (
    <header className="sticky top-0 z-50 border-b border-sv-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" aria-label="Serva"><Logo /></Link>
        <div className="flex items-center gap-1">
          <LangSwitch className="text-sv-slate hover:bg-sv-mist hover:text-sv-ink" />
          <Link to="/" className="inline-flex h-10 items-center gap-2 rounded-lg border border-sv-line px-4 text-sm font-medium text-sv-ink transition-colors hover:bg-sv-mist">
            <span aria-hidden="true">{lang === 'ar' ? '→' : '←'}</span> {back}
          </Link>
        </div>
      </div>
    </header>
  );
}
