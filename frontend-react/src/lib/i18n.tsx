// Lightweight i18n: a provider that tracks language + document direction, plus
// helpers to translate a local dictionary and to pick the right bilingual field.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Lang } from './types';

interface I18nValue { lang: Lang; dir: 'rtl' | 'ltr'; setLang: (l: Lang) => void; toggle: () => void; }
const Ctx = createContext<I18nValue>({ lang: 'ar', dir: 'rtl', setLang: () => {}, toggle: () => {} });
const LANG_KEY = 'cafeqr_lang';
const LANG_MANUAL_KEY = 'cafeqr_lang_manual';

function isLang(value: string | null): value is Lang {
  return value === 'ar' || value === 'en';
}

function deviceLang(): Lang {
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  return langs.some((l) => l.toLowerCase().startsWith('ar')) ? 'ar' : 'en';
}

function initialLang(): Lang {
  const saved = localStorage.getItem(LANG_KEY);
  const manual = localStorage.getItem(LANG_MANUAL_KEY) === '1';
  return manual && isLang(saved) ? saved : deviceLang();
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const setLang = (l: Lang) => {
    localStorage.setItem(LANG_MANUAL_KEY, '1');
    localStorage.setItem(LANG_KEY, l);
    setLangState(l);
  };
  const toggle = () => {
    setLangState((p) => {
      const next = p === 'ar' ? 'en' : 'ar';
      localStorage.setItem(LANG_MANUAL_KEY, '1');
      localStorage.setItem(LANG_KEY, next);
      return next;
    });
  };
  return <Ctx.Provider value={{ lang, dir, setLang, toggle }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);

export type Dict = Record<Lang, Record<string, string>>;
/** Translate a key against a local dictionary for the current language. */
export const useT = (dict: Dict) => {
  const { lang } = useI18n();
  return (key: string) => dict[lang][key] ?? dict.ar[key] ?? key;
};

/** Pick nameAr/nameEn (or descriptionAr/En) for the active language with fallback. */
export function pick(obj: Record<string, any> | null | undefined, field: 'name' | 'description', lang: Lang): string {
  if (!obj) return '';
  const ar = obj[field + 'Ar'];
  const en = obj[field + 'En'];
  return (lang === 'ar' ? ar || en : en || ar) || '';
}

/**
 * Display name of a café or a branch. Same preference as {@link pick}, plus a last fallback to
 * the legacy single `name` column — a café created before names were bilingual has only that,
 * and an empty header reads as a bug where a name in the other language merely reads as data.
 */
export function nameOf(
  obj: { name?: string | null; nameEn?: string | null; nameAr?: string | null } | null | undefined,
  lang: Lang,
): string {
  if (!obj) return '';
  const preferred = lang === 'ar' ? obj.nameAr : obj.nameEn;
  const other = lang === 'ar' ? obj.nameEn : obj.nameAr;
  return (preferred || other || obj.name) ?? '';
}

/**
 * Display name of a person — staff, owner, admin. Same fallback ladder as {@link nameOf}, over
 * the `fullName*` fields. A person's two names are one name in two scripts, not a translation,
 * so falling back to the other script always names the right human.
 */
export function personName(
  person: { fullName?: string | null; fullNameEn?: string | null; fullNameAr?: string | null } | null | undefined,
  lang: Lang,
): string {
  if (!person) return '';
  const preferred = lang === 'ar' ? person.fullNameAr : person.fullNameEn;
  const other = lang === 'ar' ? person.fullNameEn : person.fullNameAr;
  return (preferred || other || person.fullName) ?? '';
}

/** Shared bilingual language toggle button group. */
/**
 * Isolate a machine-format value so an RTL page cannot reorder it.
 *
 * A string made of ONE numeric run is safe on its own ("1.900", "4/17" — the separator is
 * a digit-to-digit one, so it stays a single run). A string made of TWO OR MORE runs joined
 * by a neutral — a space, a dash, "×", "@", "·", or a leading sign — is ordered by the
 * paragraph instead, so in Arabic it comes out backwards:
 *
 *   7:00–23:00  ->  23:00–7:00      (wrong opening hours, not just ugly)
 *   9123 4567   ->  4567 9123
 *   @cafe       ->  cafe@
 *   −12%        ->  %12−
 *
 * Use this for anything that is a FORMAT: phone numbers, opening hours, handles, signed
 * percentages, ranges, IDs, timestamps. Never use it for prose — names, addresses and
 * descriptions must stay direction-neutral (a plain <bdi>, which is dir="auto"), because
 * forcing those to LTR creates the same bug in the opposite direction.
 */
export function Ltr({ children }: { children: ReactNode }) {
  return <bdi dir="ltr">{children}</bdi>;
}

/**
 * The same isolation for a value that has to live inside a plain string rather than JSX
 * (a joined preview line, a title attribute). U+2066 LEFT-TO-RIGHT ISOLATE … U+2069 POP
 * DIRECTIONAL ISOLATE is exactly what <bdi dir="ltr"> compiles down to in the bidi
 * algorithm — invisible characters, so the string still compares and measures normally.
 */
export const ltrText = (value: string | number): string => '\u2066' + value + '\u2069';

export function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div className="lang" role="group" aria-label="Language">
      <button aria-pressed={lang === 'ar'} onClick={() => setLang('ar')} lang="ar">ع</button>
      <button aria-pressed={lang === 'en'} onClick={() => setLang('en')} lang="en">EN</button>
    </div>
  );
}
