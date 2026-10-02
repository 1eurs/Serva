import type { ReactNode } from 'react';
import { Ltr } from '../../lib/i18n';
import type { Lang } from '../../lib/types';

/* ─────────────────────────────────────────────────────────────────────────
   The product, drawn in HTML — one scene per hour of the landing page's day.
   Each is a faithful sketch of a real Serva screen (team, QR menu, order pad,
   kitchen ticket, menu manager, order board, day report), cut down to the part
   that hour is about. Everything here is data from a made-up venue; no real
   customer's menu or numbers appear.

   One language per scene, like the product: Arabic page, Arabic screen. The
   ticket is the one place mono type meets Arabic, so its item names switch to
   Plex Sans Arabic there — Plex Mono has no Arabic glyphs.
   ───────────────────────────────────────────────────────────────────────── */

type L = { en: string; ar: string };
const cur: L = { en: 'OMR', ar: 'ر.ع' };
export const omr = (n: number) => n.toFixed(3);

export function Money({ n, lang, className = '' }: { n: number; lang: Lang; className?: string }) {
  return (
    <span className={`tnum whitespace-nowrap ${className}`}>
      <Ltr>{omr(n)}</Ltr> <span className="text-[0.85em] text-sv-slate">{cur[lang]}</span>
    </span>
  );
}

export function Screen({ title, meta, children, className = '' }: {
  title: string; meta?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-sv-line bg-white text-sv-ink shadow-lift ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-sv-line px-4 py-3">
        <span className="text-sm font-semibold">{title}</span>
        {meta && <span className="text-xs text-sv-slate">{meta}</span>}
      </div>
      {children}
    </div>
  );
}

/** Status chips carry a word as well as a colour — never colour alone. */
const STATUS = {
  new: { en: 'New', ar: 'جديد', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  prep: { en: 'Preparing', ar: 'قيد التحضير', cls: 'bg-violet-50 text-violet-700 ring-violet-200' },
  ready: { en: 'Ready', ar: 'جاهز', cls: 'bg-sv-tint text-sv-green ring-emerald-200' },
  free: { en: 'Free', ar: 'متاحة', cls: 'bg-sv-mist text-sv-slate ring-sv-line' },
} as const;
export type Status = keyof typeof STATUS;

export function Chip({ s, lang, compact = false }: { s: Status; lang: Lang; compact?: boolean }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full py-0.5 text-[11px] font-medium ring-1 ring-inset ${compact ? 'px-1.5' : 'px-2'} ${STATUS[s].cls}`}>
      {STATUS[s][lang]}
    </span>
  );
}

/** A top-down cup or plate: the rim, the drink, the crema. Abstract on purpose. */
export function Cup({ fill, crema, rim = '#EDE7DD' }: { fill: string; crema?: string; rim?: string }) {
  return (
    <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sv-mist">
      <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: rim }}>
        <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: fill }}>
          {crema && <span className="h-3 w-3 rounded-full" style={{ background: crema }} />}
        </span>
      </span>
    </span>
  );
}

/* ── 06:30 · team logins and the till ─────────────────────────────────── */
export function TeamScene({ lang }: { lang: Lang }) {
  const people = [
    { n: { en: 'Salim', ar: 'سالم' }, role: { en: 'Owner', ar: 'المالك' }, perms: [{ en: 'Everything', ar: 'كل الصلاحيات' }], tone: 'bg-sv-tint text-sv-green' },
    { n: { en: 'Aisha', ar: 'عائشة' }, role: { en: 'Cashier', ar: 'كاشير' }, perms: [{ en: 'Orders', ar: 'الطلبات' }, { en: 'Till', ar: 'الدرج' }], tone: 'bg-amber-50 text-amber-800' },
    { n: { en: 'Yousef', ar: 'يوسف' }, role: { en: 'Barista', ar: 'باريستا' }, perms: [{ en: 'Orders', ar: 'الطلبات' }], tone: 'bg-violet-50 text-violet-700' },
  ];
  return (
    <Screen title={lang === 'ar' ? 'الفريق' : 'Team'} meta={lang === 'ar' ? '3 في المناوبة' : '3 on shift'} className="mx-auto w-full max-w-[460px]">
      <ul className="divide-y divide-sv-line">
        {people.map((p) => (
          <li key={p.n.en} className="flex items-center gap-3 px-4 py-3">
            <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${p.tone}`}>
              {p.n[lang].charAt(0)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{p.n[lang]}</span>
              <span className="block text-xs text-sv-slate">{p.role[lang]}</span>
            </span>
            <span className="flex flex-wrap justify-end gap-1">
              {p.perms.map((x) => (
                <span key={x.en} className="rounded-md border border-sv-line px-2 py-0.5 text-[11px] text-sv-slate">{x[lang]}</span>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <div className="border-t border-sv-line bg-sv-mist/60 px-4 py-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{lang === 'ar' ? 'الدرج · الفرع الرئيسي' : 'Till · Main branch'}</span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sv-green">
            <span className="sv-live relative h-2 w-2 rounded-full bg-sv-mint text-sv-mint" aria-hidden="true" />
            {lang === 'ar' ? 'مفتوح' : 'Open'}
          </span>
        </div>
        <p className="mt-1 text-xs text-sv-slate">
          {lang === 'ar' ? <>فُتح <span className="tnum"><Ltr>06:34</Ltr></span> بواسطة عائشة</> : <>Opened <span className="tnum">06:34</span> by Aisha</>}
        </p>
        <div className="mt-3 flex items-baseline justify-between rounded-lg bg-white px-3 py-2.5 ring-1 ring-inset ring-sv-line">
          <span className="text-xs text-sv-slate">{lang === 'ar' ? 'المبلغ الافتتاحي' : 'Opening float'}</span>
          <Money n={20} lang={lang} className="text-base font-semibold" />
        </div>
      </div>
    </Screen>
  );
}

/* ── 07:30 · QR ordering + stamps ─────────────────────────────────────── */
export function QrScene({ lang }: { lang: Lang }) {
  const items = [
    { n: { en: 'Spanish latte', ar: 'سبانش لاتيه' }, p: 1.8, cup: <Cup fill="#B98A5E" crema="#E6CBA8" />, q: 1 },
    { n: { en: 'Flat white', ar: 'فلات وايت' }, p: 1.6, cup: <Cup fill="#8C5A36" crema="#D9B38C" />, q: 1 },
    { n: { en: 'Matcha latte', ar: 'ماتشا لاتيه' }, p: 2.0, cup: <Cup fill="#8DB36B" crema="#C9DDB0" />, q: 0 },
    { n: { en: 'Cardamom croissant', ar: 'كرواسون بالهيل' }, p: 1.2, cup: <Cup fill="#D9A45B" rim="#F4F1EA" />, q: 0 },
  ];
  const tabs = lang === 'ar' ? ['ساخن', 'بارد', 'مخبوزات'] : ['Hot', 'Iced', 'Bakery'];
  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col items-center gap-4 sm:flex-row sm:items-end">
      {/* the guest's phone */}
      <div className="w-[248px] shrink-0 rounded-[34px] bg-sv-ink p-[7px] shadow-lift">
        <div className="overflow-hidden rounded-[28px] bg-white text-sv-ink">
          <div className="px-4 pb-3 pt-5">
            <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-sv-line" aria-hidden="true" />
            <p className="text-[11px] text-sv-slate">{lang === 'ar' ? 'طاولة 4 · امسح واطلب' : 'Table 4 · Scan & order'}</p>
            <p className="text-base font-semibold">{lang === 'ar' ? 'القائمة' : 'Menu'}</p>
            <div className="mt-3 flex gap-1.5">
              {tabs.map((t, i) => (
                <span key={t} className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${i === 0 ? 'bg-sv-ink text-white' : 'bg-sv-mist text-sv-slate'}`}>{t}</span>
              ))}
            </div>
          </div>
          <ul className="space-y-1 px-2">
            {items.map((it) => (
              <li key={it.n.en} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
                {it.cup}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{it.n[lang]}</span>
                  <Money n={it.p} lang={lang} className="text-[11px]" />
                </span>
                <span aria-hidden="true" className={`flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-semibold ${it.q ? 'bg-sv-green text-white' : 'border border-sv-line text-sv-slate'}`}>
                  {it.q ? it.q : '+'}
                </span>
              </li>
            ))}
          </ul>
          <div className="p-3">
            <div className="flex items-center justify-between rounded-2xl bg-sv-green px-4 py-3 text-white">
              <span className="text-[12px] font-medium">{lang === 'ar' ? 'أرسل الطلب' : 'Place order'}</span>
              <span className="tnum text-[12px] font-semibold"><Ltr>3.400</Ltr> {cur[lang]}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-1">
        {/* it lands on the bar */}
        <div className="rounded-2xl border border-sv-line bg-white p-4 text-sv-ink shadow-card">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">{lang === 'ar' ? 'شاشة البار' : 'Bar screen'}</span>
            <Chip s="new" lang={lang} />
          </div>
          <p className="mt-2 text-sm font-medium">
            <span className="tnum"><Ltr>#0142</Ltr></span> · {lang === 'ar' ? 'طاولة 4' : 'Table 4'}
          </p>
          <p className="mt-0.5 text-xs text-sv-slate">
            {lang === 'ar' ? 'سبانش لاتيه، فلات وايت' : 'Spanish latte, Flat white'}
          </p>
        </div>
        {/* and the regular gets a stamp */}
        <div className="rounded-2xl border border-sv-line bg-white p-4 text-sv-ink shadow-card">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold">{lang === 'ar' ? 'بطاقة الأختام' : 'Stamp card'}</span>
            <span className="tnum text-xs text-sv-slate"><Ltr>7 / 10</Ltr></span>
          </div>
          <div className="mt-3 grid grid-cols-5 gap-1.5" aria-hidden="true">
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i} className={`aspect-square rounded-full ${i < 7 ? 'bg-sv-green' : 'border border-dashed border-sv-slate/40'}`} />
            ))}
          </div>
          <p className="mt-3 text-xs text-sv-slate">
            {lang === 'ar' ? <>باقي <span className="tnum"><Ltr>3</Ltr></span> أختام لمشروب مجاني</> : <><span className="tnum">3</span> more for a free drink</>}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── 10:00 · the order pad ────────────────────────────────────────────── */
export function PadScene({ lang }: { lang: Lang }) {
  const tiles = [
    { en: 'Espresso', ar: 'إسبريسو', p: 1.0 },
    { en: 'Flat white', ar: 'فلات وايت', p: 1.6, on: true },
    { en: 'Spanish latte', ar: 'سبانش لاتيه', p: 1.8 },
    { en: 'Cortado', ar: 'كورتادو', p: 1.4 },
    { en: 'Americano', ar: 'أمريكانو', p: 1.2 },
    { en: 'Karak tea', ar: 'شاي كرك', p: 0.5 },
  ];
  const opts = [
    { en: 'Oat milk', ar: 'حليب شوفان', p: 0.2 },
    { en: 'Extra shot', ar: 'شوت إضافي', p: 0.3, on: true },
    { en: 'Less sugar', ar: 'سكر أقل', p: 0 },
  ];
  const lines = [
    { q: 1, n: { en: 'Flat white', ar: 'فلات وايت' }, p: 1.6, mods: [{ en: 'Extra shot', ar: 'شوت إضافي', p: 0.3 }] },
    { q: 2, n: { en: 'Spanish latte', ar: 'سبانش لاتيه' }, p: 3.6, mods: [{ en: 'Oat milk', ar: 'حليب شوفان', p: 0.4 }] },
  ];
  return (
    <Screen title={lang === 'ar' ? 'شاشة الطلب' : 'Order pad'} meta={lang === 'ar' ? 'الكاونتر 1' : 'Counter 1'} className="mx-auto w-full max-w-[560px]">
      <div className="grid sm:grid-cols-[1.25fr_1fr]">
        <div className="p-3">
          <div className="grid grid-cols-3 gap-2">
            {tiles.map((t) => (
              <div key={t.en} className={`rounded-xl px-2.5 py-2.5 ${t.on ? 'bg-sv-tint ring-2 ring-inset ring-sv-green' : 'bg-sv-mist'}`}>
                <span className="block truncate text-[12px] font-medium leading-tight">{t[lang]}</span>
                <span className="tnum mt-1 block text-[11px] text-sv-slate"><Ltr>{omr(t.p)}</Ltr></span>
              </div>
            ))}
          </div>
          <p className="mb-1.5 mt-3 text-[11px] font-medium text-sv-slate">{lang === 'ar' ? 'خيارات · فلات وايت' : 'Options · Flat white'}</p>
          <div className="flex flex-wrap gap-1.5">
            {opts.map((o) => (
              <span key={o.en} className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${o.on ? 'bg-sv-ink text-white' : 'border border-sv-line text-sv-ink'}`}>
                {o[lang]}{o.p ? <span className={`tnum ms-1 ${o.on ? 'text-white/70' : 'text-sv-slate'}`}><Ltr>+{omr(o.p)}</Ltr></span> : null}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col border-t border-sv-line bg-sv-mist/50 p-3 sm:border-s sm:border-t-0">
          <p className="text-[11px] font-medium text-sv-slate">{lang === 'ar' ? <>زبون حاضر · بيجر <span className="tnum"><Ltr>12</Ltr></span></> : <>Walk-in · Pager <span className="tnum">12</span></>}</p>
          <ul className="mt-2 space-y-2.5">
            {lines.map((l) => (
              <li key={l.n.en} className="text-[12px]">
                <div className="flex justify-between gap-2">
                  <span className="font-medium"><span className="tnum"><Ltr>{l.q} ×</Ltr></span> {l.n[lang]}</span>
                  <span className="tnum"><Ltr>{omr(l.p)}</Ltr></span>
                </div>
                {l.mods.map((m) => (
                  <div key={m.en} className="flex justify-between gap-2 ps-5 text-sv-slate">
                    <span>+ {m[lang]}</span><span className="tnum"><Ltr>{omr(m.p)}</Ltr></span>
                  </div>
                ))}
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-4">
            <div className="flex items-baseline justify-between border-t border-sv-line pt-2.5">
              <span className="text-xs text-sv-slate">{lang === 'ar' ? 'الإجمالي' : 'Total'}</span>
              <Money n={5.9} lang={lang} className="text-base font-semibold" />
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <span className="rounded-lg border border-sv-line bg-white py-2 text-center text-xs font-medium">{lang === 'ar' ? 'نقداً' : 'Cash'}</span>
              <span className="rounded-lg bg-sv-green py-2 text-center text-xs font-medium text-white">{lang === 'ar' ? 'بطاقة' : 'Card'}</span>
            </div>
          </div>
        </div>
      </div>
    </Screen>
  );
}

/* ── 13:00 · kitchen ticket + the floor ───────────────────────────────── */
export function KitchenScene({ lang }: { lang: Lang }) {
  const mono = lang === 'en' ? 'font-mono' : '';
  const lines = [
    { q: 1, n: { en: 'Margherita', ar: 'مارغريتا' }, note: { en: 'thin crust', ar: 'عجينة رقيقة' } },
    { q: 2, n: { en: 'Chicken machboos', ar: 'مكبوس دجاج' } },
    { q: 1, n: { en: 'Fattoush', ar: 'فتوش' }, note: { en: 'no onion', ar: 'بدون بصل' } },
  ];
  const tables: { t: number; s: Status; at?: string }[] = [
    { t: 1, s: 'free' }, { t: 2, s: 'ready', at: '13:01' }, { t: 3, s: 'prep', at: '12:52' },
    { t: 4, s: 'free' }, { t: 5, s: 'new', at: '13:03' }, { t: 6, s: 'new', at: '13:04' },
  ];
  return (
    <div className="mx-auto grid w-full max-w-[560px] items-start gap-5 sm:grid-cols-[250px_1fr]">
      {/* the printer, and what it just printed */}
      <div className="mx-auto w-[250px]">
        <div className="relative z-10 rounded-2xl bg-sv-ink px-4 pb-3 pt-3 shadow-lift">
          <div className="flex items-center justify-between">
            <span className={`text-white/60 ${lang === 'ar' ? 'text-[11px]' : 'font-mono text-[10px] uppercase tracking-[0.14em]'}`}>{lang === 'ar' ? 'طابعة المطبخ' : 'Kitchen printer'}</span>
            <span className={`inline-flex items-center gap-1.5 text-sv-mint ${lang === 'ar' ? 'text-[11px]' : 'font-mono text-[10px]'}`}>
              <span className="sv-live relative h-1.5 w-1.5 rounded-full bg-sv-mint" aria-hidden="true" />
              {lang === 'ar' ? 'متصلة' : 'online'}
            </span>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-black/70 ring-1 ring-white/10" aria-hidden="true" />
        </div>
        {/* Clip only the top edge, where paper leaves the slot — overflow:hidden would
            also cut the ticket's shadow off into a hard grey box. */}
        <div className="-mt-2 px-3" style={{ clipPath: 'inset(0 -48px -64px -48px)' }}>
          <div className="sv-feed">
            <div className="sv-ticket-lift">
              <div className={`sv-ticket px-4 pb-6 pt-5 text-[12px] leading-relaxed text-sv-ink ${mono}`}>
                <div className="flex items-baseline justify-between text-[11px]">
                  <span className={lang === 'ar' ? 'text-[12px] font-semibold' : 'tracking-[0.12em]'}>{lang === 'ar' ? 'المطبخ' : 'KITCHEN'}</span>
                  <span className="font-mono"><Ltr>#0217</Ltr></span>
                </div>
                <p className="mt-2 text-[15px] font-semibold">{lang === 'ar' ? 'طاولة 6 · داخل المطعم' : 'TABLE 6 · DINE-IN'}</p>
                <p className="font-mono text-[11px] text-sv-slate">13:04</p>
                <div className="my-2.5 border-t border-dashed border-sv-ink/30" />
                <ul className="space-y-1.5">
                  {lines.map((l) => (
                    <li key={l.n.en} className="flex gap-3">
                      <span className="w-4 shrink-0 font-mono font-semibold">{l.q}</span>
                      <span>
                        <span className="block font-medium">{l.n[lang]}</span>
                        {l.note && <span className="block text-[11px] text-sv-slate">— {l.note[lang]}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="my-2.5 border-t border-dashed border-sv-ink/30" />
                <p className="text-[11px]">{lang === 'ar' ? 'ملاحظة: حساسية من المكسرات' : 'NOTE: nut allergy'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* the floor, as the team sees it */}
      <Screen title={lang === 'ar' ? 'الصالة' : 'Floor'} meta={lang === 'ar' ? 'الغداء' : 'Lunch'}>
        <div className="grid grid-cols-2 gap-2 p-3">
          {tables.map((t) => (
            <div key={t.t} className={`rounded-xl border p-2.5 ${t.t === 6 ? 'border-amber-300 bg-amber-50/40' : 'border-sv-line'}`}>
              <div className="flex items-center justify-between gap-1">
                <span className="text-sm font-semibold">{lang === 'ar' ? 'طاولة ' : 'T'}<span className="tnum"><Ltr>{t.t}</Ltr></span></span>
                {t.at && <span className="font-mono text-[10px] text-sv-slate">{t.at}</span>}
              </div>
              <div className="mt-2"><Chip s={t.s} lang={lang} /></div>
            </div>
          ))}
        </div>
      </Screen>
    </div>
  );
}

/* ── 16:00 · the menu between orders ──────────────────────────────────── */
export function MenuScene({ lang }: { lang: Lang }) {
  const rows = [
    { n: { en: 'Kunafa cup', ar: 'كوب كنافة' }, p: 1.5, on: false, cup: <Cup fill="#E0A04A" crema="#F2D49B" rim="#F4F1EA" /> },
    { n: { en: 'Luqaimat', ar: 'لقيمات' }, p: 1.2, on: true, cup: <Cup fill="#C98A3E" crema="#7A4A1E" rim="#F4F1EA" /> },
    { n: { en: 'Saffron milk cake', ar: 'كيكة الحليب بالزعفران' }, p: 1.9, on: true, cup: <Cup fill="#F1D9A6" crema="#E3A93B" rim="#F4F1EA" /> },
    { n: { en: 'Date pudding', ar: 'بودينغ التمر' }, p: 1.4, on: true, cup: <Cup fill="#6B3F22" crema="#A8714A" rim="#F4F1EA" /> },
  ];
  return (
    <Screen title={lang === 'ar' ? 'القائمة · الحلويات' : 'Menu · Desserts'} meta={lang === 'ar' ? 'في فرعين' : 'On 2 branches'} className="mx-auto w-full max-w-[500px]">
      <ul className="divide-y divide-sv-line">
        {rows.map((r) => (
          <li key={r.n.en} className="flex items-center gap-3 px-4 py-3">
            <span className={r.on ? '' : 'opacity-50 grayscale'}>{r.cup}</span>
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-sm font-medium ${r.on ? '' : 'text-sv-slate'}`}>{r.n[lang]}</span>
              {r.on
                ? <Money n={r.p} lang={lang} className="text-xs" />
                : <span className="text-xs font-medium text-amber-800">{lang === 'ar' ? 'نفد · مخفي عن الضيوف' : 'Sold out · hidden from guests'}</span>}
            </span>
            {/* availability switch */}
            <span aria-hidden="true" className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${r.on ? 'bg-sv-green' : 'bg-sv-line'}`}>
              <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow ${r.on ? 'end-1' : 'start-1'}`} />
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-3 border-t border-sv-line bg-sv-mist/60 px-4 py-3 text-xs">
        <span className="text-sv-slate">{lang === 'ar' ? 'يتحدّث على كل رمز QR وكل فرع' : 'Updates every QR code and branch'}</span>
        <span className="inline-flex shrink-0 items-center gap-1 font-medium text-sv-green">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {lang === 'ar' ? <>حُفظ <span className="tnum"><Ltr>16:02</Ltr></span></> : <>Saved <span className="tnum">16:02</span></>}
        </span>
      </div>
    </Screen>
  );
}

/* ── 20:00 · the truck window ─────────────────────────────────────────── */
export function TruckScene({ lang }: { lang: Lang }) {
  const steps = [
    { en: 'Order sent', ar: 'أرسلنا طلبك', done: true },
    { en: 'Being prepared', ar: 'يُحضَّر الآن', done: true },
    { en: 'Ready!', ar: 'جاهز!', done: true, now: true },
  ];
  const cols: { s: Status; pagers: number[] }[] = [
    { s: 'new', pagers: [21] },
    { s: 'prep', pagers: [18, 19] },
    { s: 'ready', pagers: [17] },
  ];
  return (
    <div className="mx-auto flex w-full max-w-[540px] flex-col items-center gap-4 sm:flex-row sm:items-center">
      {/* what the guest sees on their own phone */}
      <div className="w-[236px] shrink-0 rounded-[34px] bg-[#1E2A33] p-[7px] shadow-lift ring-1 ring-white/10">
        <div className="overflow-hidden rounded-[28px] bg-white px-4 pb-5 pt-5 text-sv-ink">
          <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-sv-line" aria-hidden="true" />
          <p className="text-[11px] text-sv-slate">{lang === 'ar' ? <>الطلب <span className="tnum"><Ltr>#0388</Ltr></span></> : <>Order <span className="tnum">#0388</span></>}</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-lg bg-sv-ink px-2.5 py-1 text-xs font-semibold text-white">{lang === 'ar' ? <>بيجر <span className="tnum"><Ltr>17</Ltr></span></> : <>Pager <span className="tnum">17</span></>}</span>
          </div>
          <p className="mt-4 text-lg font-semibold leading-snug">{lang === 'ar' ? 'جاهز، استلمه من النافذة' : 'Ready. Collect at the window.'}</p>
          <ol className="mt-4 space-y-3">
            {steps.map((s) => (
              <li key={s.en} className="flex items-center gap-2.5 text-[13px]">
                <span aria-hidden="true" className={`flex h-5 w-5 items-center justify-center rounded-full ${s.now ? 'bg-sv-green text-white ring-4 ring-sv-tint' : 'bg-sv-tint text-sv-green'}`}>
                  <svg viewBox="0 0 16 16" width="11" height="11"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
                <span className={s.now ? 'font-semibold' : 'text-sv-slate'}>{s[lang]}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4 rounded-xl bg-sv-mist px-3 py-2.5 text-[12px] text-sv-slate">
            <span className="tnum"><Ltr>3 ×</Ltr></span> {lang === 'ar' ? 'شاي كرك' : 'Karak tea'}<br />
            <span className="tnum"><Ltr>2 ×</Ltr></span> {lang === 'ar' ? 'ساندويتش شيبس عُمان' : 'Chips Oman sandwich'}
          </div>
        </div>
      </div>

      {/* and the board inside the truck */}
      <Screen title={lang === 'ar' ? 'الطلبات' : 'Orders'} meta={lang === 'ar' ? 'نافذة المساء' : 'Evening'} className="w-full sm:flex-1">
        <div className="grid grid-cols-3 gap-1.5 p-3">
          {cols.map((c) => (
            <div key={c.s} className="min-w-0 rounded-xl bg-sv-mist p-1.5">
              <Chip s={c.s} lang={lang} compact />
              <div className="mt-2 space-y-1.5">
                {c.pagers.map((p) => (
                  <div key={p} className={`rounded-lg bg-white px-2 py-2 text-center shadow-sm ${c.s === 'ready' ? 'ring-2 ring-sv-green' : 'ring-1 ring-sv-line'}`}>
                    <span className="block text-[10px] text-sv-slate">{lang === 'ar' ? 'بيجر' : 'Pager'}</span>
                    <span className="tnum block font-mono text-lg font-semibold leading-tight">{p}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Screen>
    </div>
  );
}

/* ── 23:30 · close the day ────────────────────────────────────────────── */
/* Orders per hour, 06:00–23:00. Sums to the 238 on the tile above it, and the
   sales tile divides by it to the average ticket — the numbers agree. */
const HOURLY = [4, 18, 27, 19, 11, 9, 13, 16, 10, 6, 7, 9, 15, 24, 31, 11, 5, 3];
const PEAK = HOURLY.indexOf(Math.max(...HOURLY));
const hh = (i: number) => String(6 + i).padStart(2, '0') + ':00';

export function CloseScene({ lang }: { lang: Lang }) {
  const max = Math.max(...HOURLY);
  const stock = [
    { n: { en: 'Oat milk', ar: 'حليب الشوفان' }, d: 2, tone: 'bg-amber-600', track: 'bg-amber-100' },
    { n: { en: 'Cups 12 oz', ar: 'أكواب 12 أونصة' }, d: 5, tone: 'bg-sv-green', track: 'bg-sv-tint' },
    { n: { en: 'Coffee beans', ar: 'حبوب القهوة' }, d: 9, tone: 'bg-sv-green', track: 'bg-sv-tint' },
  ];
  const days = (d: number) => (lang === 'ar' ? (d === 2 ? 'يومان' : `${d} أيام`) : `${d} days`);
  const kpis = [
    { l: { en: 'Sales', ar: 'المبيعات' }, v: <Money n={412.6} lang={lang} /> },
    { l: { en: 'Orders', ar: 'الطلبات' }, v: <span className="tnum">238</span> },
    { l: { en: 'Avg. ticket', ar: 'متوسط الطلب' }, v: <Money n={1.734} lang={lang} /> },
  ];
  return (
    <Screen
      title={lang === 'ar' ? 'اليوم · الفرع الرئيسي' : 'Today · Main branch'}
      meta={lang === 'ar' ? <>أُغلق <span className="tnum"><Ltr>23:41</Ltr></span></> : <>Closed <span className="tnum">23:41</span></>}
      className="mx-auto w-full max-w-[580px]"
    >
      <div className="grid grid-cols-3 divide-x divide-sv-line border-b border-sv-line rtl:divide-x-reverse">
        {kpis.map((k) => (
          <div key={k.l.en} className="px-4 py-3">
            <p className="text-[11px] text-sv-slate">{k.l[lang]}</p>
            <p className="mt-0.5 text-[15px] font-semibold sm:text-lg">{k.v}</p>
          </div>
        ))}
      </div>

      {/* orders by hour — one series, so the title names it and no legend is needed */}
      <figure className="px-4 pb-2 pt-3">
        <figcaption className="text-xs font-medium">{lang === 'ar' ? 'الطلبات حسب الساعة' : 'Orders by hour'}</figcaption>
        <div className="relative mt-7 flex h-28 items-end gap-[2px] border-b border-sv-line" aria-hidden="true">
          {HOURLY.map((v, i) => (
            <div key={i} className="sv-bar group relative flex h-full flex-1 items-end justify-center">
              <div
                className="w-full max-w-[18px] rounded-t-[4px]"
                style={{ height: `${(v / max) * 100}%`, background: i === PEAK ? '#04704F' : '#35A57F' }}
              />
              {i === PEAK && (
                <span className="absolute -top-5 whitespace-nowrap font-mono text-[10px] font-medium text-sv-ink">{hh(i)} · {v}</span>
              )}
              <span className="sv-tip pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-md bg-sv-ink px-2 py-1 font-mono text-[10px] text-white opacity-0 transition">
                {hh(i)} · {v}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] text-sv-slate" aria-hidden="true">
          <span>06</span><span>12</span><span>18</span><span>23</span>
        </div>
        {/* the same numbers, readable without the picture */}
        <table className="sr-only">
          <caption>{lang === 'ar' ? 'الطلبات حسب الساعة' : 'Orders by hour'}</caption>
          <tbody>{HOURLY.map((v, i) => <tr key={i}><th>{hh(i)}</th><td>{v}</td></tr>)}</tbody>
        </table>
      </figure>

      <div className="grid gap-px border-t border-sv-line bg-sv-line sm:grid-cols-2">
        <div className="bg-white px-4 py-3">
          <p className="text-xs font-medium">{lang === 'ar' ? 'إغلاق الدرج' : 'Till close'}</p>
          <dl className="mt-2 space-y-1 text-xs">
            <div className="flex justify-between"><dt className="text-sv-slate">{lang === 'ar' ? 'المتوقَّع' : 'Expected'}</dt><dd><Money n={186.4} lang={lang} /></dd></div>
            <div className="flex justify-between"><dt className="text-sv-slate">{lang === 'ar' ? 'المعدود' : 'Counted'}</dt><dd><Money n={186.1} lang={lang} /></dd></div>
            <div className="flex justify-between font-medium"><dt>{lang === 'ar' ? 'الفرق' : 'Variance'}</dt><dd className="tnum text-amber-800"><Ltr>−0.300</Ltr></dd></div>
          </dl>
        </div>
        <div className="bg-white px-4 py-3">
          <p className="text-xs font-medium">{lang === 'ar' ? 'يكفي لـ' : 'Days of cover'}</p>
          <ul className="mt-2 space-y-2">
            {stock.map((s) => (
              <li key={s.n.en} className="text-xs">
                <div className="flex justify-between"><span>{s.n[lang]}</span><span className="text-sv-slate">{days(s.d)}</span></div>
                <div className={`mt-1 h-1.5 rounded-full ${s.track}`} aria-hidden="true">
                  <div className={`h-full rounded-full ${s.tone}`} style={{ width: `${(s.d / 10) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Screen>
  );
}
