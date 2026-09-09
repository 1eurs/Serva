import { useState } from 'react';
import { login, ApiError } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { useI18n } from '../../lib/i18n';
import { cleanIdentifier, cleanSecret, syncInput } from '../../lib/format';
import './login.css';

/** Codes that describe where the account stands rather than what was typed wrong. */
const QUIET = new Set(['ACCOUNT_DISABLED', 'INVITE_PENDING']);

interface Props {
  mark?: string;
  title: string;
  subtitle: string;
}

export default function Login({ mark = '◆', title, subtitle }: Props) {
  const { lang } = useI18n();
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState<string | undefined>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setErrorCode(undefined);
    setLoading(true);
    try {
      await login(username, password); // App re-renders via useAuth on success
    } catch (err) {
      const code = err instanceof ApiError ? err.errorCode : undefined;
      // Said in the language of the page. The server answers in English, and half of these
      // screens are Arabic — a sign-in that fails is the worst place to switch languages.
      const message = code && code in L.byCode
        ? L.byCode[code]
        : err instanceof ApiError ? err.message : L.failed;
      setError(message);
      setErrorCode(code);
      // These two are a state of the account, not a mistake to bark about: they stay on the
      // card where they can be read twice.
      if (!QUIET.has(code ?? '')) toast(message);
    } finally {
      setLoading(false);
    }
  }

  const L = lang === 'ar'
    ? { user: 'اسم المستخدم', pass: 'كلمة المرور', enter: 'دخول', failed: 'تعذّر تسجيل الدخول.',
        byCode: {
          INVALID_CREDENTIALS: 'اسم المستخدم أو كلمة المرور غير صحيحة. تذكّر أن الدخول باسم المستخدم لا بالبريد.',
          INVITE_PENDING: 'افتح رابط الدعوة الذي أرسله لك المقهى لإكمال إعداد حسابك.',
          ACCOUNT_DISABLED: 'حسابك بانتظار تأكيد التحويل البنكي. سنفعّله بعد تأكيد الدفع من لوحة المنصّة.',
        } as Record<string, string> }
    : { user: 'Username', pass: 'Password', enter: 'Sign in', failed: 'Login failed.',
        byCode: {
          INVALID_CREDENTIALS: 'That username or password isn’t right. Remember it’s your username, not your email.',
          INVITE_PENDING: 'Open the invite link the café sent you to finish setting up your account.',
          ACCOUNT_DISABLED: 'Your account is waiting for bank-transfer confirmation. Sign-in unlocks after a platform admin confirms payment.',
        } as Record<string, string> };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="login-top"><div className="mark">{mark}</div></div>
        <h1>{title}</h1>
        <div className="sub">{subtitle}</div>
        {/* A login is machine data: on an Arabic page it must not be reordered by the paragraph
            around it, and what a paste smuggles in has to come off before it is sent. */}
        <div className="field"><label>{L.user}</label>
          <input value={username} dir="ltr" onChange={(e) => setUsername(syncInput(e.target, cleanIdentifier))}
            autoComplete="username" autoCapitalize="none" spellCheck={false} /></div>
        <div className="field"><label>{L.pass}</label>
          <input type="password" value={password} dir="ltr" onChange={(e) => setPassword(syncInput(e.target, cleanSecret))}
            autoComplete="current-password" /></div>
        {error && <div className={'login-error' + (QUIET.has(errorCode ?? '') ? ' pending' : '')}>{error}</div>}
        <button className="btn full" disabled={loading}>{loading ? '…' : L.enter}</button>
      </form>
    </div>
  );
}
