import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { useI18n } from '../../lib/i18n';
import { BRAND } from '../../lib/brand';
import { cleanSecret, syncInput } from '../../lib/format';
import './login.css';

export default function ResetPassword() {
  const { lang } = useI18n();
  const toast = useToast();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const L = lang === 'ar'
    ? { title: 'تعيين كلمة مرور جديدة', sub: 'اختر كلمة مرور جديدة لحسابك', pass: 'كلمة المرور الجديدة', confirm: 'تأكيد كلمة المرور',
        submit: 'تحديث كلمة المرور', okH: 'تم تحديث كلمة المرور ✓', okP: 'يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.',
        invalidH: 'رابط غير صالح', invalidP: 'هذا الرابط غير صالح أو منتهٍ. اطلب رابطاً جديداً.',
        short: 'الحد الأدنى 8 أحرف', mismatch: 'كلمتا المرور غير متطابقتين', signin: 'تسجيل الدخول ←' }
    : { title: 'Set a new password', sub: 'Choose a new password for your account', pass: 'New password', confirm: 'Confirm password',
        submit: 'Update password', okH: 'Password updated ✓', okP: 'You can now sign in with your new password.',
        invalidH: 'Invalid link', invalidP: 'This link is invalid or has expired. Please request a new one.',
        short: 'At least 8 characters', mismatch: 'Passwords don’t match', signin: 'Go to sign in →' };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) { toast(L.short); return; }
    if (pw !== pw2) { toast(L.mismatch); return; }
    setLoading(true);
    try {
      await api.post('/api/auth/reset-password', { token, newPassword: pw }, { auth: false });
      setDone(true);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="login-top"><div className="mark">{BRAND.name.charAt(0)}</div></div>
        {!token ? (
          <><h1>{L.invalidH}</h1><div className="sub">{L.invalidP}</div></>
        ) : done ? (
          <><h1>{L.okH}</h1><div className="sub">{L.okP}</div></>
        ) : (
          <>
            <h1>{L.title}</h1><div className="sub">{L.sub}</div>
            <div className="field"><label>{L.pass}</label>
              <input type="password" value={pw} autoComplete="new-password"
                onChange={(e) => setPw(syncInput(e.target, cleanSecret))} /></div>
            <div className="field"><label>{L.confirm}</label>
              <input type="password" value={pw2} autoComplete="new-password"
                onChange={(e) => setPw2(syncInput(e.target, cleanSecret))} /></div>
            <button className="btn full" disabled={loading}>{loading ? '…' : L.submit}</button>
          </>
        )}
        <div className="demo-note"><Link to="/dashboard">{L.signin}</Link></div>
      </form>
    </div>
  );
}
