import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { cleanOtp, syncInput, syncPhoneInput } from '../../lib/format';
import type { LoyaltyPortalEntry } from '../../lib/types';
import { useI18n, useT, nameOf, type Dict } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import { CustomerFrame } from './CustomerFrame';
import { StampCard } from './StampCard';
import { useVenue, menuPathOf } from './venue';
import './loyalty.css';

const TOKEN_KEY = 'cafeqr_loyalty_token';

const DICT: Dict = {
  ar: {
    title: 'مكافآتي', sub: 'أختامك في كل المقاهي', back: 'رجوع',
    signinTitle: 'اجمع، وكافئ نفسك', signinLede: 'أدخل رقم جوالك وسنرسل رمزاً عبر واتساب لعرض أختامك في كل مقهى تطلب منه.',
    phone: 'رقم الجوال', phonePh: '9XXXXXXX', sendCode: 'إرسال الرمز', sending: 'جارٍ الإرسال…',
    codeTitle: 'أدخل الرمز', codeLede: 'أرسلنا رمزاً من 6 أرقام إلى', code: 'رمز التحقق',
    verify: 'تحقق واعرض', verifying: 'جارٍ التحقق…', changeNum: 'تغيير الرقم',
    signout: 'تسجيل الخروج',
    emptyTitle: 'لا أختام بعد', emptySub: 'اطلب من مقهى يقدّم بطاقة أختام لتبدأ بالجمع، وستظهر بطاقاتك هنا.',
    of: 'من', moreOne: 'ختم واحد يتبقّى على', moreN: 'أختام تتبقّى على', counter: 'استبدل مكافأتك المجانية عند الدفع',
    ready: 'مكافأة جاهزة', readyN: 'مكافآت جاهزة',
    summaryReady: 'مكافأة مجانية بانتظارك! 🎉', summaryReadyN: 'مكافآت بانتظارك! 🎉',
    summaryReadySub: 'استبدلها مع طلبك القادم ✨',
    sampleCafe: 'مقهى الرصيف', sampleReward: 'قهوة مجانية',
  },
  en: {
    title: 'My rewards', sub: 'Your stamps across every café', back: 'Back',
    signinTitle: 'Collect & treat yourself', signinLede: 'Enter your number and we’ll send a WhatsApp code to show your stamps at every café you order from.',
    phone: 'Phone number', phonePh: '9XXXXXXX', sendCode: 'Send code', sending: 'Sending…',
    codeTitle: 'Enter the code', codeLede: 'We sent a 6-digit code to', code: 'Verification code',
    verify: 'Verify & view', verifying: 'Verifying…', changeNum: 'Change number',
    signout: 'Sign out',
    emptyTitle: 'No stamps yet', emptySub: 'Order from a café that runs a stamp card to start collecting — your cards will show up here.',
    of: 'of', moreOne: 'more stamp for', moreN: 'more stamps for', counter: 'Redeem your free reward at checkout',
    ready: 'Reward ready', readyN: 'rewards ready',
    summaryReady: 'A free treat is waiting for you! 🎉', summaryReadyN: 'treats are waiting for you! 🎉',
    summaryReadySub: 'Redeem it with your next order ✨',
    sampleCafe: 'Curb Side Coffee', sampleReward: 'Free coffee',
  },
};

type Step = 'phone' | 'code' | 'done';

export default function LoyaltyPortal() {
  const { lang } = useI18n();
  const t = useT(DICT);
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();
  const venue = useVenue();

  // Return to wherever the customer opened this from: an explicit `from` path, else the café
  // menu they were browsing (kept in the venue store), else just step back in history.
  const goBack = () => {
    const from = (loc.state as { from?: string } | null)?.from;
    if (from) { nav(from); return; }
    if (venue.slug) { nav(menuPathOf(venue.slug, venue.branchId, venue.tableToken, venue.orderType)); return; }
    nav(-1);
  };

  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [step, setStep] = useState<Step>(() => (localStorage.getItem(TOKEN_KEY) ? 'done' : 'phone'));
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');

  const portal = useQuery({
    queryKey: ['loyalty-portal', token],
    queryFn: () => api.post<LoyaltyPortalEntry[]>('/api/public/loyalty/me', { phoneToken: token }, { auth: false }),
    enabled: !!token,
    retry: false,
  });

  // An expired/invalid token drops us back to the phone step.
  useEffect(() => {
    if (token && portal.isError) {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setStep('phone');
    }
  }, [token, portal.isError]);

  const verify = useMutation({
    mutationFn: ({ otpCode }: { otpCode: string; silent?: boolean }) =>
      api.post<{ phoneToken: string }>(
        '/api/public/otp/verify', { phone: phone.trim(), code: otpCode }, { auth: false }),
    onSuccess: (data) => {
      localStorage.setItem(TOKEN_KEY, data.phoneToken);
      setToken(data.phoneToken);
      setStep('done');
    },
    onError: (e, vars) => {
      // The silent attempt failing is the normal "real OTP is enforced" path — no toast,
      // just show the code screen like before.
      if (vars.silent) setStep('code');
      else toast(e instanceof ApiError ? e.message : 'Error');
    },
  });
  const sendCode = useMutation({
    mutationFn: () => api.post<void>('/api/public/otp/send', { phone: phone.trim() }, { auth: false }),
    onSuccess: () => {
      // OTP is currently bypassed server-side (no WhatsApp provider configured — see
      // OtpService), so self-verify with a dummy code and skip the code screen entirely.
      // Once a real provider is configured, this dummy verify fails and we fall back to
      // asking for the code, exactly like before.
      verify.mutate({ otpCode: '000000', silent: true });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  const signOut = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setCode('');
    setStep('phone');
  };

  const entries = portal.data ?? [];
  const rewardsReady = entries.reduce((s, e) => s + e.availableRewards, 0);

  const cardFooter = (e: LoyaltyPortalEntry) => {
    if (e.availableRewards > 0) {
      return (
        <>
          <span className="loy-progress">{t('counter')}</span>
          <span className="loy-ready">★ {e.availableRewards > 1
            ? <><span className="num">{e.availableRewards}</span> {t('readyN')}</>
            : t('ready')}</span>
        </>
      );
    }
    const remaining = Math.max(0, e.stampsRequired - e.stamps);
    return (
      <span className="loy-progress">
        <b className="num">{e.stamps}</b> {t('of')} <span className="num">{e.stampsRequired}</span>
        {remaining > 0 && <> · {remaining} {remaining === 1 ? t('moreOne') : t('moreN')} {e.rewardLabel}</>}
      </span>
    );
  };

  return (
    <CustomerFrame>
      <div className="loy-wrap">
        <header className="loy-hdr">
          <span className="loy-spark">🎟️</span>
          <div>
            <h1>{t('title')}</h1>
            <p>{t('sub')}</p>
          </div>
          <button className="loy-back" onClick={goBack} aria-label={t('back')}>‹</button>
        </header>

        {step === 'phone' && (
          <div className="loy-auth">
            <StampCard sample name={t('sampleCafe')} rewardLabel={t('sampleReward')}
              stamps={4} stampsRequired={6} availableRewards={0} />
            <h2>{t('signinTitle')}</h2>
            <p className="loy-lede">{t('signinLede')}</p>
            <div className="loy-field">
              <label htmlFor="loy-phone">{t('phone')}</label>
              <input id="loy-phone" className="num" inputMode="tel" value={phone} placeholder={t('phonePh')}
                onChange={(e) => setPhone(syncPhoneInput(e.target))} />
            </div>
            <button className="loy-btn" disabled={!phone.trim() || sendCode.isPending}
              onClick={() => sendCode.mutate()}>
              {sendCode.isPending ? t('sending') : t('sendCode')}
            </button>
          </div>
        )}

        {step === 'code' && (
          <div className="loy-auth">
            <div style={{ fontSize: 40, textAlign: 'center' }}>💬</div>
            <h2>{t('codeTitle')}</h2>
            <p className="loy-lede">{t('codeLede')} <b dir="ltr">{phone.trim()}</b></p>
            <div className="loy-field">
              <label htmlFor="loy-code">{t('code')}</label>
              <input id="loy-code" className="loy-code num" inputMode="numeric" maxLength={6} value={code}
                autoFocus placeholder="······" autoComplete="one-time-code"
                onChange={(e) => setCode(syncInput(e.target, cleanOtp))} />
            </div>
            <button className="loy-btn" disabled={code.trim().length !== 6 || verify.isPending}
              onClick={() => verify.mutate({ otpCode: code.trim() })}>
              {verify.isPending ? t('verifying') : t('verify')}
            </button>
            <button className="loy-link" onClick={() => { setStep('phone'); setCode(''); }}>{t('changeNum')}</button>
          </div>
        )}

        {step === 'done' && (
          <div className="loy-body">
            {portal.isLoading ? (
              <div className="center" style={{ padding: 40 }}><div className="spinner" /></div>
            ) : entries.length === 0 ? (
              <div className="loy-empty">
                <div className="big">🎟️</div>
                <h3>{t('emptyTitle')}</h3>
                <p>{t('emptySub')}</p>
              </div>
            ) : (
              <>
                {rewardsReady > 0 && (
                  <div className="loy-treat">
                    <span className="gift" aria-hidden="true">🎁</span>
                    <div className="loy-treat-txt">
                      <b>{rewardsReady > 1
                        ? <><span className="num">{rewardsReady}</span> {t('summaryReadyN')}</>
                        : t('summaryReady')}</b>
                      <span>{t('summaryReadySub')}</span>
                    </div>
                  </div>
                )}
                {entries.map((e) => (
                  <StampCard key={e.restaurantSlug}
                    name={nameOf({ name: e.restaurantName, nameEn: e.restaurantNameEn, nameAr: e.restaurantNameAr }, lang)}
                    logoUrl={e.logoUrl}
                    rewardLabel={e.rewardLabel} stamps={e.stamps} stampsRequired={e.stampsRequired}
                    availableRewards={e.availableRewards} footer={cardFooter(e)}
                    cardColor={e.cardColor} cardBg={e.cardBg} stampIcon={e.stampIcon} cardMotif={e.cardMotif}
                    rewardItemNames={(e.rewardItems ?? [])
                      .map((r) => (lang === 'ar' ? (r.nameAr || r.nameEn) : (r.nameEn || r.nameAr)) ?? '')
                      .filter(Boolean)} />
                ))}
                <button className="loy-link" style={{ margin: '6px auto 0' }} onClick={signOut}>{t('signout')}</button>
              </>
            )}
          </div>
        )}
      </div>
    </CustomerFrame>
  );
}
