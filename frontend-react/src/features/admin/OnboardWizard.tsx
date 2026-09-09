// Provisioning a café, as four questions instead of one wall of inputs.
//
// The old create form asked for the café, its owner, its tier and its first branch in a single
// modal, which is why half of them were left blank: nothing told you which blanks mattered.
// A wizard can, because each step can say what it is for and what happens if you skip it.
//
// The same component runs "new café" and "convert a request" — a converted lead is just this
// form with the contact's answers already filled in, and closing it writes the café back to
// the lead so the pipeline and the platform cannot drift apart.
import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import { cleanIdentifier, cleanSecret, omr, syncInput } from '../../lib/format';
import type { Lead, Plan, Restaurant } from '../../lib/types';
import { DICT } from './dict';

const STEPS = ['wizStep1', 'wizStep2', 'wizStep3', 'wizStep4'] as const;

/** Readable-out-loud alphabet: no O/0 or l/1, because this gets dictated over the phone. */
const PW_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const generatePassword = () => {
  const bytes = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(bytes, (b) => PW_ALPHABET[b % PW_ALPHABET.length]).join('');
};

/** Latin-only slug; an Arabic-only name slugifies to nothing and is left to the server. */
const slugify = (v: string) =>
  v.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

interface Form {
  nameAr: string; nameEn: string; slug: string; phone: string; email: string;
  branch: string; plan: Plan; currency: string; vatEnabled: boolean; vatRate: string;
  withOwner: boolean; oNameAr: string; oNameEn: string; oEmail: string; oPhone: string; oPass: string;
}

export default function OnboardWizard({ lead, onClose, onDone }: {
  lead?: Lead | null;
  onClose: () => void;
  onDone: (created: Restaurant) => void;
}) {
  const t = useT(DICT);
  const toast = useToast();
  const [step, setStep] = useState(0);
  // A blank form is not yet a mistake. The "name it" message waits until somebody actually
  // tries to move on, rather than greeting them with an error they haven't made.
  const [triedNext, setTriedNext] = useState(false);

  const [f, setF] = useState<Form>(() => ({
    // A lead gives us one name in whichever script the café typed it, plus a contact. Filing it
    // under the right language here is what stops an Arabic name landing in the English field.
    nameAr: lead && /[؀-ۿ]/.test(lead.cafeName) ? lead.cafeName : '',
    nameEn: lead && !/[؀-ۿ]/.test(lead.cafeName) ? lead.cafeName : '',
    slug: '',
    phone: lead?.phone ?? '',
    email: lead?.email ?? '',
    branch: '',
    plan: 'PRO',
    currency: 'OMR',
    vatEnabled: true,
    vatRate: '5',
    withOwner: true,
    oNameAr: lead && /[؀-ۿ]/.test(lead.contactName) ? lead.contactName : '',
    oNameEn: lead && !/[؀-ۿ]/.test(lead.contactName) ? lead.contactName : '',
    oEmail: lead?.email ?? '',
    oPhone: lead?.phone ?? '',
    oPass: '',
  }));
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  const displayName = f.nameEn.trim() || f.nameAr.trim();
  const autoSlug = useMemo(() => slugify(f.nameEn), [f.nameEn]);
  // Arabic slugifies to nothing, so an Arabic-only café has no address to derive and the
  // server refuses to guess one. Asking here — where the name is being typed — is the whole
  // difference between a two-second decision and a dead end on the last step.
  const effectiveSlug = slugify(f.slug) || autoSlug;
  const slugReady = effectiveSlug.length > 0;

  const ownerReady = !f.withOwner || (f.oEmail.trim().length > 3 && f.oPass.length >= 8);
  const canAdvance =
    step === 0 ? (!!displayName && slugReady)
    : step === 1 ? ownerReady
    : true;

  const create = useMutation({
    mutationFn: async () => {
      const body = {
        nameAr: f.nameAr.trim() || undefined,
        nameEn: f.nameEn.trim() || undefined,
        // Sent only when the admin typed one; otherwise the server derives it from the English name.
        slug: slugify(f.slug) || undefined,
        phone: f.phone.trim() || undefined,
        email: f.email.trim() || undefined,
        currency: f.currency,
        vatEnabled: f.vatEnabled,
        vatRate: f.vatEnabled ? Number(f.vatRate || 0) : 0,
        plan: f.plan,
        defaultBranchName: f.branch.trim() || undefined,
        owner: f.withOwner
          ? {
              fullNameAr: f.oNameAr.trim() || undefined,
              fullNameEn: f.oNameEn.trim() || undefined,
              fullName: (f.oNameAr.trim() || f.oNameEn.trim()) ? undefined : displayName,
              email: f.oEmail.trim(),
              phone: f.oPhone.trim() || undefined,
              password: f.oPass,
            }
          : undefined,
      };
      // Converting goes through the lead so the café and the request are linked in one
      // transaction; there is no window where the café exists but the lead still reads NEW.
      return lead
        ? api.post<Restaurant>(`/api/admin/leads/${lead.id}/convert`, body)
        : api.post<Restaurant>('/api/admin/restaurants', body);
    },
    onSuccess: onDone,
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card wiz">
        <h3>{t('wizTitle')}</h3>
        {lead && (
          <div className="ph">{t('wizFromLead')}: <strong>{lead.cafeName}</strong> · {lead.contactName}</div>
        )}

        <ol className="wiz-steps">
          {STEPS.map((key, i) => (
            <li key={key} className={i === step ? 'on' : i < step ? 'done' : ''}>
              <span className="n">{i < step ? '✓' : i + 1}</span>{t(key)}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <div className="wiz-body">
            <div className="row2">
              <div className="field"><label>{t('rNameAr')}</label>
                <input value={f.nameAr} lang="ar" dir="rtl" onChange={(e) => set('nameAr', e.target.value)} /></div>
              <div className="field"><label>{t('rNameEn')}</label>
                <input value={f.nameEn} lang="en" dir="ltr" onChange={(e) => set('nameEn', e.target.value)} /></div>
            </div>
            <div className="ph">{t('nameHint')}</div>
            <div className="row2">
              <div className="field"><label>{t('rSlug')}</label>
                <input className="num" dir="ltr" value={f.slug} placeholder={autoSlug || 'my-cafe'}
                  onChange={(e) => set('slug', e.target.value)} /></div>
              <div className="field"><label>{t('rBranch')}</label>
                <input value={f.branch} placeholder={displayName || '—'}
                  onChange={(e) => set('branch', e.target.value)} /></div>
            </div>
            <div className="row2">
              <div className="field"><label>{t('phone')}</label>
                <input className="num" dir="ltr" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></div>
              <div className="field"><label>{t('email')}</label>
                <input className="num" dir="ltr" value={f.email}
                  onChange={(e) => set('email', syncInput(e.target, cleanIdentifier))} /></div>
            </div>
            {triedNext && !displayName && <div className="ph bad">{t('wizNeedName')}</div>}
            {triedNext && !!displayName && !slugReady && <div className="ph bad">{t('wizNeedSlug')}</div>}
          </div>
        )}

        {step === 1 && (
          <div className="wiz-body">
            <label className="wiz-toggle">
              <input type="checkbox" checked={f.withOwner} onChange={(e) => set('withOwner', e.target.checked)} />
              <span>{t('wizOwnerToggle')}</span>
            </label>
            <div className="ph">{f.withOwner ? t('wizOwnerHint') : t('wizOwnerSkip')}</div>
            {f.withOwner && (
              <>
                <div className="row2">
                  <div className="field"><label>{t('oNameAr')}</label>
                    <input value={f.oNameAr} lang="ar" dir="rtl" onChange={(e) => set('oNameAr', e.target.value)} /></div>
                  <div className="field"><label>{t('oNameEn')}</label>
                    <input value={f.oNameEn} lang="en" dir="ltr" onChange={(e) => set('oNameEn', e.target.value)} /></div>
                </div>
                <div className="row2">
                  {/* This email is the owner's username. It is read off this screen and sent to
                      them in a message, so whatever a paste dropped in here has to come off now —
                      by the time they cannot sign in, nobody can see why. */}
                  <div className="field"><label>{t('oEmail')}</label>
                    <input className="num" dir="ltr" value={f.oEmail} placeholder="owner@cafe.om"
                      onChange={(e) => set('oEmail', syncInput(e.target, cleanIdentifier))} /></div>
                  <div className="field"><label>{t('phone')}</label>
                    <input className="num" dir="ltr" value={f.oPhone} onChange={(e) => set('oPhone', e.target.value)} /></div>
                </div>
                <div className="field"><label>{t('oPass')}</label>
                  <div className="wiz-pw">
                    <input className="num" dir="ltr" value={f.oPass} placeholder="min 8 chars"
                      onChange={(e) => set('oPass', syncInput(e.target, cleanSecret))} />
                    <button type="button" className="btn sm ghost" onClick={() => set('oPass', generatePassword())}>⟳</button>
                  </div>
                </div>
              </>
            )}
            {triedNext && !ownerReady && <div className="ph bad">{t('wizNeedOwner')}</div>}
          </div>
        )}

        {step === 2 && (
          <div className="wiz-body">
            <div className="field"><label>{t('rPlan')}</label>
              <div className="seg">
                {(['STANDARD', 'PRO', 'ENTERPRISE'] as Plan[]).map((p) => (
                  <button key={p} type="button" className={f.plan === p ? 'on' : ''} onClick={() => set('plan', p)}>
                    {p === 'STANDARD' ? t('rPlanStd') : p === 'PRO' ? t('rPlanPro') : t('rPlanEnt')}
                  </button>
                ))}
              </div>
            </div>
            <div className="ph">
              {f.plan === 'STANDARD' ? t('tierStdDesc') : f.plan === 'PRO' ? t('tierProDesc') : t('tierEntDesc')}
            </div>
            <div className="row2">
              <div className="field"><label>{t('currency')}</label>
                <input className="num" dir="ltr" value={f.currency} maxLength={3}
                  onChange={(e) => set('currency', e.target.value.toUpperCase())} /></div>
              <div className="field"><label>{t('vat')}</label>
                <div className="wiz-pw">
                  <input className="num" dir="ltr" value={f.vatRate} disabled={!f.vatEnabled}
                    onChange={(e) => set('vatRate', e.target.value)} />
                  <label className="wiz-toggle inline">
                    <input type="checkbox" checked={f.vatEnabled} onChange={(e) => set('vatEnabled', e.target.checked)} />
                    <span>%</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="ph">{t('wizSubHint')}</div>
          </div>
        )}

        {step === 3 && (
          <div className="wiz-body">
            <div className="ph">{t('wizReviewHint')}</div>
            <div className="subbox">
              <div className="kv"><span className="k">{t('rName')}</span><span className="v">{displayName}</span></div>
              <div className="kv"><span className="k">{t('slug')}</span><span className="v num">{effectiveSlug || '—'}</span></div>
              <div className="kv"><span className="k">{t('rBranch')}</span><span className="v">{f.branch.trim() || displayName}</span></div>
              <div className="kv"><span className="k">{t('planLabel')}</span><span className="v">
                {f.plan === 'STANDARD' ? t('rPlanStd') : f.plan === 'PRO' ? t('rPlanPro') : t('rPlanEnt')}</span></div>
              <div className="kv"><span className="k">{t('vat')}</span>
                <span className="v num">{f.vatEnabled ? `${omr(Number(f.vatRate || 0))}%` : t('none')}</span></div>
              <div className="kv"><span className="k">{t('oName')}</span>
                <span className="v">{f.withOwner ? (f.oEmail || '—') : t('wizNoOwner')}</span></div>
              {f.withOwner && f.oPass && (
                <div className="kv"><span className="k">{t('oPass')}</span><span className="v num">{f.oPass}</span></div>
              )}
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn ghost" onClick={step === 0 ? onClose : () => setStep(step - 1)}>
            {step === 0 ? t('cancel') : t('wizBack')}
          </button>
          {step < STEPS.length - 1 ? (
            <button className="btn" onClick={() => {
              setTriedNext(true);
              if (canAdvance) { setStep(step + 1); setTriedNext(false); }
            }}>{t('wizNext')}</button>
          ) : (
            <button className="btn" disabled={!displayName || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? t('wizCreating') : t('wizFinish')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
