import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, adoptSession } from '../../lib/api';
import { useI18n, LangToggle } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import { BRAND } from '../../lib/brand';
import type { AuthResponse, InvitePreview } from '../../lib/types';
import './login.css';

/**
 * Where an invited staff member lands.
 *
 * <p>The token in the URL is the only credential — there is no account to log into yet. So the
 * page shows what the invite is for <em>before</em> asking for anything, sets the password, and
 * drops the member straight into the dashboard. Making them retype a password they chose two
 * seconds ago on a login screen would be pure friction.
 */
export default function JoinPage() {
  const { token = '' } = useParams();
  const { lang } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loadError, setLoadError] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const L = lang === 'ar'
    ? {
        title: 'انضم إلى الفريق', joining: 'جارٍ التحميل…',
        at: 'في', username: 'اسم المستخدم', access: 'صلاحياتك',
        pass: 'اختر كلمة المرور', pass2: 'تأكيد كلمة المرور',
        join: 'إنشاء الحساب والدخول',
        short: 'كلمة المرور 8 أحرف على الأقل.', mismatch: 'كلمتا المرور غير متطابقتين.',
        signin: 'اذهب لتسجيل الدخول', welcome: 'أهلاً بك!',
        hint: 'اختر كلمة مرور تعرفها أنت وحدك — لا يستطيع صاحب المقهى رؤيتها.',
      }
    : {
        title: 'Join the team', joining: 'Loading…',
        at: 'at', username: 'Your username', access: 'What you can do',
        pass: 'Choose a password', pass2: 'Confirm password',
        join: 'Create account & sign in',
        short: 'Use at least 8 characters.', mismatch: "Those passwords don't match.",
        signin: 'Go to sign in', welcome: 'Welcome aboard!',
        hint: "Pick a password only you know — the café owner can't see it.",
      };

  const PERM_LABELS: Record<string, { ar: string; en: string }> = {
    ORDERS: { ar: 'الطلبات', en: 'Orders' },
    PAYMENTS: { ar: 'المدفوعات', en: 'Payments' },
    MENU: { ar: 'القائمة', en: 'Menu' },
    QR_TABLES: { ar: 'الطاولات ورموز QR', en: 'Tables & QR' },
    TEAM: { ar: 'الفريق', en: 'Team' },
    ANALYTICS: { ar: 'التحليلات', en: 'Analytics' },
    PROFILE: { ar: 'إعدادات المقهى', en: 'Café settings' },
    BRANCHES: { ar: 'الفروع', en: 'Branches' },
    STOCK: { ar: 'المخزون', en: 'Stock' },
  };
  const permLabel = (p: string) => PERM_LABELS[p]?.[lang] ?? p;

  useEffect(() => {
    let cancelled = false;
    api.get<InvitePreview>(`/api/public/invites/${encodeURIComponent(token)}`, { auth: false })
      .then((p) => { if (!cancelled) setPreview(p); })
      .catch((e) => { if (!cancelled) setLoadError(e instanceof ApiError ? e.message : 'Invalid link'); });
    return () => { cancelled = true; };
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError(L.short); return; }
    if (password !== confirm) { setError(L.mismatch); return; }
    setError('');
    setBusy(true);
    try {
      const auth = await api.post<AuthResponse>(
        `/api/public/invites/${encodeURIComponent(token)}/accept`, { password }, { auth: false });
      // Signed in already — the token response is a full session, so store it and go.
      adoptSession(auth);
      toast(L.welcome);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not complete sign-up');
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="login">
        <div className="login-card">
          <div className="login-top"><div className="mark">{BRAND.name}</div><LangToggle /></div>
          <h1>{L.title}</h1>
          <div className="login-error">{loadError}</div>
          <button className="btn full" onClick={() => navigate('/dashboard')}>{L.signin}</button>
        </div>
      </div>
    );
  }

  if (!preview) {
    return <div className="login"><div className="login-card"><div className="sub">{L.joining}</div></div></div>;
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="login-top"><div className="mark">{BRAND.name}</div><LangToggle /></div>
        <h1>{L.title}</h1>
        <div className="sub">
          {preview.fullName}{preview.cafeName ? ` — ${L.at} ${preview.cafeName}` : ''}
        </div>

        <div className="field">
          <label>{L.username}</label>
          {/* Read-only: the café chose it, and it is what they will type to sign in later. */}
          <input value={preview.username} readOnly />
        </div>

        {preview.permissions.length > 0 && (
          <div className="field">
            <label>{L.access}</label>
            <div className="join-perms">
              {preview.permissions.map((p) => <span key={p}>{permLabel(p)}</span>)}
            </div>
          </div>
        )}

        <div className="field">
          <label>{L.pass}</label>
          <input type="password" value={password} autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="field">
          <label>{L.pass2}</label>
          <input type="password" value={confirm} autoComplete="new-password"
            onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <div className="join-hint">{L.hint}</div>

        {error && <div className="login-error">{error}</div>}
        <button className="btn full" disabled={busy}>{busy ? '…' : L.join}</button>
      </form>
    </div>
  );
}
