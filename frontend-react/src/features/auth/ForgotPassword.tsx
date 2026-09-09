import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { useI18n } from '../../lib/i18n';
import { BRAND } from '../../lib/brand';
import { cleanIdentifier, syncInput } from '../../lib/format';
import './login.css';

export default function ForgotPassword() {
  const { lang } = useI18n();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const L = lang === 'ar'
    ? { title: 'نسيت كلمة المرور؟', sub: 'أدخل بريدك وسنرسل لك رابط إعادة التعيين', email: 'البريد الإلكتروني',
        send: 'إرسال الرابط', okh: 'تحقّق من بريدك ✓', okp: 'إن كان البريد مسجّلاً لدينا، أرسلنا رابطاً لإعادة تعيين كلمة المرور.', back: '← العودة لتسجيل الدخول' }
    : { title: 'Forgot password?', sub: 'Enter your email and we’ll send a reset link', email: 'Email',
        send: 'Send reset link', okh: 'Check your email ✓', okp: 'If that email is registered, we’ve sent a link to reset your password.', back: '← Back to sign in' };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await api.post('/api/auth/forgot-password', { email }, { auth: false });
      setSent(true);
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
        {sent ? (
          <><h1>{L.okh}</h1><div className="sub">{L.okp}</div></>
        ) : (
          <>
            <h1>{L.title}</h1><div className="sub">{L.sub}</div>
            <div className="field"><label>{L.email}</label>
              <input type="email" value={email} dir="ltr" autoComplete="username"
                onChange={(e) => setEmail(syncInput(e.target, cleanIdentifier))} /></div>
            <button className="btn full" disabled={loading}>{loading ? '…' : L.send}</button>
          </>
        )}
        <div className="demo-note"><Link to="/dashboard">{L.back}</Link></div>
      </form>
    </div>
  );
}
