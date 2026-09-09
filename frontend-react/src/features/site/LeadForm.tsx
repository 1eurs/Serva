// The landing page's "request access" form — the front door to the admin pipeline.
//
// Every CTA on this page used to be a wa.me link, so a café that wanted in had to open
// WhatsApp and type. That converts well here and stays as the second option below, but it
// records nothing: the pipeline board had no way to ever receive a row. This posts the six
// fields LeadService.create reads, and the lead lands in NEW.
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
  or: string;
  wa: string;
  err: {
    cafeName: string; contactName: string; phone: string; phoneShort: string;
    email: string; rate: string; generic: string; offline: string;
  };
  ok: { title: string; body: string; wa: string };
};

const COPY: Record<Lang, Copy> = {
  en: {
    label: {
      cafeName: 'Café name', contactName: 'Your name', phone: 'Phone / WhatsApp',
      email: 'Email', city: 'City', note: 'Anything else?',
    },
    ph: {
      cafeName: 'e.g. Qurum Juice', contactName: 'e.g. Mahmood Al Zeidi', phone: '9xxx xxxx',
      email: 'you@cafe.om', city: 'e.g. Muscat', note: 'Branches, what you use today, when you want to go live…',
    },
    optional: 'optional',
    submit: 'Request access',
    submitting: 'Sending…',
    or: 'Prefer to talk? ',
    wa: 'Message us on WhatsApp',
    err: {
      cafeName: 'Please tell us your café’s name.',
      contactName: 'Please tell us your name.',
      phone: 'We need a number to call you back on.',
      phoneShort: 'That doesn’t look like a full phone number.',
      email: 'That email doesn’t look right.',
      rate: 'Too many attempts — please wait a minute and try again.',
      generic: 'Something went wrong on our side. Please try again, or message us on WhatsApp.',
      offline: 'Couldn’t reach us — check your connection, or message us on WhatsApp.',
    },
    ok: {
      title: 'Got it — thank you!',
      body: 'Your request is with our team. We’ll call you back within one working day to get you set up.',
      wa: 'Message us on WhatsApp',
    },
  },
  ar: {
    label: {
      cafeName: 'اسم المقهى', contactName: 'اسمك', phone: 'الهاتف / واتساب',
      email: 'البريد الإلكتروني', city: 'المدينة', note: 'أي شيء آخر؟',
    },
    ph: {
      cafeName: 'مثال: عصير و قهوة القرم', contactName: 'مثال: محمود الزيدي', phone: '‎9xxx xxxx',
      email: 'you@cafe.om', city: 'مثال: مسقط', note: 'الفروع، ما تستخدمه حالياً، ومتى تودّ الانطلاق…',
    },
    optional: 'اختياري',
    submit: 'اطلب الوصول',
    submitting: 'جارٍ الإرسال…',
    or: 'تفضّل التحدّث مباشرة؟ ',
    wa: 'راسلنا عبر واتساب',
    err: {
      cafeName: 'من فضلك اكتب اسم المقهى.',
      contactName: 'من فضلك اكتب اسمك.',
      phone: 'نحتاج رقماً للتواصل معك.',
      phoneShort: 'الرقم يبدو غير مكتمل.',
      email: 'البريد الإلكتروني غير صحيح.',
      rate: 'محاولات كثيرة — انتظر دقيقة ثم أعد المحاولة.',
      generic: 'حدث خطأ لدينا. حاول مرة أخرى، أو راسلنا عبر واتساب.',
      offline: 'تعذّر الوصول إلينا — تحقّق من اتصالك، أو راسلنا عبر واتساب.',
    },
    ok: {
      title: 'وصلنا طلبك — شكراً لك!',
      body: 'طلبك الآن لدى فريقنا. سنتصل بك خلال يوم عمل واحد لتجهيز حسابك.',
      wa: 'راسلنا عبر واتساب',
    },
  },
};

/** Digits only — a number is "full enough" at 8, which is an Oman local number. */
const digitCount = (s: string) => (s.match(/\d/g) ?? []).length;
/* Deliberately loose: the server's @Email is the real check, this only saves a round trip
   on the obvious typos. A stricter pattern rejects addresses that are actually valid. */
const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export default function LeadForm({ waHref }: { waHref: string }) {
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
        className="mx-auto max-w-2xl border-4 border-black bg-white p-8 text-center shadow-neo outline-none md:p-10"
      >
        <span aria-hidden="true" className="mx-auto flex h-14 w-14 items-center justify-center border-4 border-black bg-neo-accent text-3xl font-black leading-none shadow-neo-sm">✓</span>
        <h3 className="mt-6 text-2xl font-black uppercase tracking-tighter md:text-3xl">{c.ok.title}</h3>
        <p className="mx-auto mt-3 max-w-md text-base font-bold text-black/70">{c.ok.body}</p>
        <a
          href={waHref} target="_blank" rel="noopener noreferrer"
          className="mt-7 inline-flex h-12 items-center justify-center border-4 border-black bg-black px-6 text-sm font-bold uppercase tracking-wide text-white shadow-neo-sm transition-all duration-100 hover:-translate-y-0.5 hover:shadow-neo active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
        >
          {c.ok.wa}
        </a>
      </div>
    );
  }

  /* ── form ────────────────────────────────────────────────────────────── */
  const inputBase =
    'w-full border-4 border-black bg-white px-4 py-3 text-base font-bold text-neo-ink shadow-none ' +
    'transition-shadow duration-100 focus:shadow-neo-sm focus:outline-none';
  const bad = 'border-red-600 bg-red-50';

  function Err({ f }: { f: Field }) {
    if (!errors[f]) return null;
    return <p id={id(`${f}-err`)} className="mt-1.5 text-sm font-bold text-red-700">{errors[f]}</p>;
  }

  function Label({ f, optional }: { f: Field; optional?: boolean }) {
    return (
      <label htmlFor={id(f)} className="mb-1.5 block text-xs font-black uppercase tracking-widest">
        {c.label[f]}
        {optional && <span className="ms-2 font-bold normal-case tracking-normal text-black/40">({c.optional})</span>}
      </label>
    );
  }

  const aria = (f: Field) =>
    ({ 'aria-invalid': errors[f] ? true : undefined, 'aria-describedby': errors[f] ? id(`${f}-err`) : undefined }) as const;

  return (
    <form onSubmit={submit} noValidate className="mx-auto max-w-2xl border-4 border-black bg-white p-6 text-start shadow-neo md:p-8">
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
            id={id('email')} name="email" type="email" inputMode="email" autoComplete="email"
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
          <p className="mt-4 border-4 border-red-600 bg-red-50 p-3 text-sm font-bold text-red-700">{formError}</p>
        )}
      </div>

      <button
        type="submit" disabled={pending}
        className="mt-6 inline-flex h-14 w-full items-center justify-center gap-2 border-4 border-black bg-neo-accent px-7 text-sm font-bold uppercase tracking-wide text-black shadow-neo-sm transition-all duration-100 hover:-translate-y-0.5 hover:shadow-neo active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-neo-sm"
      >
        {pending ? c.submitting : c.submit}
      </button>

      <p className="mt-4 text-center text-sm font-bold text-black/60">
        {c.or}
        <a href={waHref} target="_blank" rel="noopener noreferrer" className="underline decoration-4 underline-offset-4 hover:text-black">
          {c.wa}
        </a>
      </p>
    </form>
  );
}
