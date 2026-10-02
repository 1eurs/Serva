// The landing page's call-back form — the only way in. It posts the six fields
// LeadService.create reads; the lead lands in NEW on the admin pipeline and emails the team.
// The page carries no WhatsApp link or phone number on purpose: every enquiry is recorded.
//
// Lives under src/features/site/ because that is the only tree tailwind.config.js scans —
// a form built anywhere else would render unstyled.
import { useId, useRef, useState } from 'react';
import { useI18n } from '../../lib/i18n';
import { api, ApiError } from '../../lib/api';
import type { Lang } from '../../lib/types';

/* Mirrors CreateLeadRequest's @Size limits, so the browser stops overlong input before the
   server has to reject it. */
const MAX = { cafeName: 150, contactName: 150, phone: 40, email: 150, city: 100, note: 1000 };

type Field = 'cafeName' | 'contactName' | 'phone' | 'email' | 'city' | 'note';
type Values = Record<Field, string>;
const EMPTY: Values = { cafeName: '', contactName: '', phone: '', email: '', city: '', note: '' };

type Copy = {
  label: Record<Field, string>;
  ph: Record<Field, string>;
  optional: string;
  submit: string;
  submitting: string;
  err: {
    cafeName: string; contactName: string; phone: string; phoneShort: string;
    email: string; rate: string; generic: string; offline: string;
  };
  ok: { title: string; body: string };
};

const COPY: Record<Lang, Copy> = {
  en: {
    label: {
      cafeName: 'Business name', contactName: 'Your name', phone: 'Phone',
      email: 'Email', city: 'City', note: 'Anything else?',
    },
    ph: {
      cafeName: 'e.g. Karak Corner', contactName: 'e.g. Ahmed Al Balushi', phone: '9xxx xxxx',
      email: 'you@cafe.om', city: 'e.g. Muscat', note: 'Branches, current system, start date…',
    },
    optional: 'optional',
    submit: 'Request a call back',
    submitting: 'Sending…',
    err: {
      cafeName: 'Please tell us the name of your venue.',
      contactName: 'Please tell us your name.',
      phone: 'We need a number to call you back on.',
      phoneShort: 'That doesn’t look like a full phone number.',
      email: 'That email doesn’t look right.',
      rate: 'Too many attempts. Wait a minute and try again.',
      generic: 'Something went wrong on our side. Please try again.',
      offline: 'Couldn’t reach us. Check your connection and try again.',
    },
    ok: {
      title: 'Thank you. We got your details.',
      body: 'We’ll call you within one working day.',
    },
  },
  ar: {
    label: {
      cafeName: 'اسم النشاط', contactName: 'اسمك', phone: 'رقم الهاتف',
      email: 'البريد الإلكتروني', city: 'المدينة', note: 'أي شيء آخر؟',
    },
    ph: {
      cafeName: 'مثال: ركن الكرك', contactName: 'مثال: أحمد البلوشي', phone: '‎9xxx xxxx',
      email: 'you@cafe.om', city: 'مثال: مسقط', note: 'الفروع، النظام الحالي، موعد البدء…',
    },
    optional: 'اختياري',
    submit: 'اطلب اتصالاً',
    submitting: 'جارٍ الإرسال…',
    err: {
      cafeName: 'من فضلك اكتب اسم منشأتك.',
      contactName: 'من فضلك اكتب اسمك.',
      phone: 'نحتاج رقماً للتواصل معك.',
      phoneShort: 'الرقم يبدو غير مكتمل.',
      email: 'البريد الإلكتروني غير صحيح.',
      rate: 'محاولات كثيرة. انتظر دقيقة ثم حاول مجدداً.',
      generic: 'حدث خطأ لدينا. حاول مرة أخرى.',
      offline: 'تعذّر الاتصال. تحقّق من الإنترنت وحاول مجدداً.',
    },
    ok: {
      title: 'شكراً لك، وصلتنا بياناتك.',
      body: 'نتصل بك خلال يوم عمل.',
    },
  },
};

/** Digits only — a number is "full enough" at 8, which is an Oman local number. */
const digitCount = (s: string) => (s.match(/\d/g) ?? []).length;
/* Deliberately loose: the server's @Email is the real check, this only saves a round trip
   on the obvious typos. A stricter pattern rejects addresses that are actually valid. */
const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export default function LeadForm() {
  const { lang } = useI18n();
  const c = COPY[lang];
  const uid = useId();
  const id = (f: string) => `${uid}-${f}`;

  const [v, setV] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState('');
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  // Only start flagging fields red after the first submit — nobody wants to be told their
  // name is wrong while they are still typing it.
  const [tried, setTried] = useState(false);
  const honeypot = useRef('');
  const okRef = useRef<HTMLDivElement>(null);

  function validate(vals: Values): Partial<Record<Field, string>> {
    const e: Partial<Record<Field, string>> = {};
    if (!vals.cafeName.trim()) e.cafeName = c.err.cafeName;
    if (!vals.contactName.trim()) e.contactName = c.err.contactName;
    if (!vals.phone.trim()) e.phone = c.err.phone;
    else if (digitCount(vals.phone) < 8) e.phone = c.err.phoneShort;
    if (vals.email.trim() && !looksLikeEmail(vals.email.trim())) e.email = c.err.email;
    return e;
  }

  function set(f: Field, value: string) {
    const next = { ...v, [f]: value };
    setV(next);
    if (tried) setErrors(validate(next));
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setTried(true);
    setFormError('');

    const found = validate(v);
    setErrors(found);
    if (Object.keys(found).length) {
      // Send focus to the first thing that needs fixing, rather than leaving the reader to
      // hunt for the red text themselves.
      const order: Field[] = ['cafeName', 'contactName', 'phone', 'email'];
      const first = order.find((f) => found[f]);
      if (first) document.getElementById(id(first))?.focus();
      return;
    }

    // A bot filled the hidden field. Show it the same success it would have got, and post
    // nothing — noisy rejection just teaches the next attempt what to avoid.
    if (honeypot.current.trim()) { setDone(true); return; }

    setPending(true);
    try {
      const trim = (s: string) => (s.trim() ? s.trim() : undefined);
      await api.post('/api/public/leads', {
        cafeName: v.cafeName.trim(),
        contactName: v.contactName.trim(),
        phone: trim(v.phone),
        email: trim(v.email),
        city: trim(v.city),
        note: trim(v.note),
      }, { auth: false });
      setDone(true);
      // The form is gone from the DOM now; move the reader to what replaced it.
      requestAnimationFrame(() => okRef.current?.focus());
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.httpStatus === 429 ? c.err.rate : err.message || c.err.generic);
      } else {
        setFormError(c.err.offline);
      }
    } finally {
      setPending(false);
    }
  }

  /* ── success ─────────────────────────────────────────────────────────── */
  if (done) {
    return (
      <div
        ref={okRef}
        tabIndex={-1}
        className="rounded-2xl bg-white p-8 text-center shadow-card outline-none ring-1 ring-sv-line md:p-10"
      >
        <span aria-hidden="true" className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sv-tint text-sv-green">
          <svg viewBox="0 0 16 16" width="22" height="22"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <h3 className="mt-5 text-2xl font-semibold">{c.ok.title}</h3>
        <p className="mx-auto mt-3 max-w-md text-sv-slate">{c.ok.body}</p>
      </div>
    );
  }

  /* ── form ────────────────────────────────────────────────────────────── */
  const inputBase =
    'w-full rounded-xl border border-sv-line bg-white px-4 py-3 text-base text-sv-ink ' +
    'transition-[border-color,box-shadow] duration-150 hover:border-sv-slate/40 ' +
    'focus:border-sv-green focus:shadow-[0_0_0_4px_rgba(4,120,87,0.14)] focus:outline-none';
  const bad = 'border-red-600 bg-red-50/40';

  function Err({ f }: { f: Field }) {
    if (!errors[f]) return null;
    return <p id={id(`${f}-err`)} className="mt-1.5 text-sm text-red-700">{errors[f]}</p>;
  }

  function Label({ f, optional }: { f: Field; optional?: boolean }) {
    return (
      <label htmlFor={id(f)} className="mb-1.5 block text-sm font-medium text-sv-ink">
        {c.label[f]}
        {optional && <span className="ms-1.5 font-normal text-sv-slate">({c.optional})</span>}
      </label>
    );
  }

  const aria = (f: Field) =>
    ({ 'aria-invalid': errors[f] ? true : undefined, 'aria-describedby': errors[f] ? id(`${f}-err`) : undefined }) as const;

  return (
    <form onSubmit={submit} noValidate className="rounded-2xl bg-white p-6 text-start shadow-card ring-1 ring-sv-line md:p-8">
      {/* Bait for bots that fill every field they find. Off-screen rather than display:none,
          which some crawlers skip, and hidden from assistive tech and the tab order. */}
      <div className="neo-hp" aria-hidden="true">
        <label htmlFor={id('website')}>Website</label>
        <input
          id={id('website')} name="website" type="text" tabIndex={-1} autoComplete="off"
          onChange={(e) => { honeypot.current = e.target.value; }}
        />
      </div>

      <div>
        <Label f="cafeName" />
        <input
          id={id('cafeName')} name="organization" type="text" autoComplete="organization"
          maxLength={MAX.cafeName} required value={v.cafeName}
          placeholder={c.ph.cafeName} onChange={(e) => set('cafeName', e.target.value)}
          className={`${inputBase} ${errors.cafeName ? bad : ''}`} {...aria('cafeName')}
        />
        <Err f="cafeName" />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <Label f="contactName" />
          <input
            id={id('contactName')} name="name" type="text" autoComplete="name"
            maxLength={MAX.contactName} required value={v.contactName}
            placeholder={c.ph.contactName} onChange={(e) => set('contactName', e.target.value)}
            className={`${inputBase} ${errors.contactName ? bad : ''}`} {...aria('contactName')}
          />
          <Err f="contactName" />
        </div>
        <div>
          <Label f="phone" />
          <input
            id={id('phone')} name="tel" type="tel" inputMode="tel" autoComplete="tel"
            maxLength={MAX.phone} required value={v.phone}
            placeholder={c.ph.phone} onChange={(e) => set('phone', e.target.value)}
            className={`${inputBase} ${errors.phone ? bad : ''}`} dir="ltr" {...aria('phone')}
          />
          <Err f="phone" />
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <Label f="email" optional />
          <input
            id={id('email')} name="email" type="email" inputMode="email" autoComplete="email" spellCheck={false}
            maxLength={MAX.email} value={v.email}
            placeholder={c.ph.email} onChange={(e) => set('email', e.target.value)}
            className={`${inputBase} ${errors.email ? bad : ''}`} dir="ltr" {...aria('email')}
          />
          <Err f="email" />
        </div>
        <div>
          <Label f="city" optional />
          <input
            id={id('city')} name="city" type="text" autoComplete="address-level2"
            maxLength={MAX.city} value={v.city}
            placeholder={c.ph.city} onChange={(e) => set('city', e.target.value)}
            className={inputBase}
          />
        </div>
      </div>

      <div className="mt-4">
        <Label f="note" optional />
        <textarea
          id={id('note')} name="note" rows={3} maxLength={MAX.note} value={v.note}
          placeholder={c.ph.note} onChange={(e) => set('note', e.target.value)}
          className={`${inputBase} resize-y`}
        />
      </div>

      {/* Announced when it appears, so a screen-reader user isn't left waiting on a button
          that silently did nothing. */}
      <div role="alert" aria-live="polite">
        {formError && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</p>
        )}
      </div>

      <button
        type="submit" disabled={pending}
        className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sv-green px-6 text-[15px] font-medium text-white transition-colors hover:bg-sv-deep disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? c.submitting : c.submit}
      </button>
    </form>
  );
}
