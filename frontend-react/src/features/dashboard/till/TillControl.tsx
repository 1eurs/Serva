import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../../lib/api';
import { useAuth, can } from '../../../lib/auth';
import { useI18n, useT } from '../../../lib/i18n';
import { Money } from '../../../lib/Money';
import { useToast } from '../../../lib/toast';
import type { TillSession, TillState } from '../../../lib/types';
import omrSymbolUrl from '../../../assets/omr-symbol.svg';
import { DICT, fill } from './copy';
import './till.css';

type T = (k: string) => string;
type Mode = 'menu' | 'close' | 'result';

/** How long the drawer has been open, in the biggest unit that fits. */
const openFor = (iso: string, t: T): string => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return t('justNow');
  if (mins < 60) return fill(t('forMins'), { n: mins });
  const hours = Math.floor(mins / 60);
  return hours < 24 ? fill(t('forHours'), { n: hours }) : fill(t('forDays'), { n: Math.floor(hours / 24) });
};

/** What to call the gap between counted and expected, and the colour that carries it. */
const gapOf = (variance: number) =>
  variance === 0 ? 'exact' as const : variance < 0 ? 'short' as const : 'over' as const;

/** The gap in one line: the amount, then the word for it. Exactly right needs no amount. */
function Gap({ variance, t }: { variance: number; t: T }) {
  const cls = gapOf(variance);
  if (cls === 'exact') return <>{t('exact')}</>;
  return <>
    <Money value={Math.abs(variance)} />
    {' '}<em>{t(cls === 'short' ? 'shortWord' : 'overWord')}</em>
  </>;
}

/**
 * The till, from the header.
 *
 * <p>The shop sign says open or shut, and shut means nothing can be sold — not from the menu,
 * not at the counter. Behind it one question, asked at both ends of the day: how much cash is
 * in the drawer. The till is the difference between the two answers and what the day's cash
 * sales say there should be.
 */
export default function TillControl({ branchId }: { branchId?: number }) {
  const t = useT(DICT);
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [sheet, setSheet] = useState(false);

  const stateQ = useQuery({
    queryKey: ['till', branchId],
    queryFn: () => api.get<TillState>(`/api/branches/${branchId}/till`),
    enabled: branchId != null,
    // Another tablet can open or close this same drawer. A minute of staleness on a shop
    // sign is the tolerable amount.
    refetchInterval: 60_000,
  });
  const state = stateQ.data;

  if (branchId == null || !state) return null;

  const closed = !state.open;
  const label = closed ? t('stClosed') : t('stOpen');

  return (
    <>
      <button
        type="button"
        className={'order-status-toggle' + (closed ? ' shut' : '')}
        aria-label={`${t('till')} — ${label}`}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={sheet}
        // The sign is allowed to be a minute stale; the figures behind it are not. Whoever
        // opens this is asking what the drawer holds right now.
        onClick={() => { setSheet(true); stateQ.refetch(); }}
      >
        <span className="status-dot" aria-hidden="true" />
        <span className="ost-label">{label}</span>
      </button>
      {sheet && (
        <TillSheet
          branchId={branchId}
          state={state}
          canCount={can(user, 'PAYMENTS')}
          onClose={() => setSheet(false)}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ['till', branchId] });
            qc.invalidateQueries({ queryKey: ['till-sessions', branchId] });
            qc.invalidateQueries({ queryKey: ['branch', branchId] });
            qc.invalidateQueries({ queryKey: ['branches', user!.restaurantId] });
          }}
          toast={toast}
          t={t}
        />
      )}
    </>
  );
}

/* ============================ THE SHEET ============================ */

function TillSheet({ branchId, state, canCount, onClose, onChanged, toast, t }: {
  branchId: number;
  state: TillState;
  canCount: boolean;
  onClose: () => void;
  onChanged: () => void;
  toast: (m: string) => void;
  t: T;
}) {
  const [mode, setMode] = useState<Mode>('menu');
  const [cash, setCash] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<TillSession | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const fail = (e: unknown) => setProblem(e instanceof ApiError ? e.message : 'Error');

  const openTill = useMutation({
    mutationFn: () => api.post<TillSession>(`/api/branches/${branchId}/till/open`,
      { openingFloat: Number(cash) }),
    onSuccess: () => { onChanged(); toast(t('openedToast')); onClose(); },
    onError: fail,
  });

  const closeTill = useMutation({
    mutationFn: () => api.post<TillSession>(`/api/branches/${branchId}/till/close`,
      { countedCash: Number(cash) }),
    onSuccess: (session) => { onChanged(); toast(t('closedToast')); setResult(session); setMode('result'); },
    onError: fail,
  });

  const busy = openTill.isPending || closeTill.isPending;
  const session = state.session;
  const counted = Number(cash);
  const ready = cash.trim() !== '' && Number.isFinite(counted) && counted >= 0;
  const title = mode === 'close' ? t('closeT')
    : mode === 'result' ? t('resultT')
    : session ? t('till') : t('openT');

  const ask = (submit: () => void, label: string, back?: () => void) => (
    <>
      <CashLine label={t('cashQ')} value={cash} onChange={setCash}
        onEnter={() => { if (ready && !busy) { setProblem(null); submit(); } }} />
      {problem && <p className="till-problem" role="alert">{problem}</p>}
      <div className="till-actions">
        <button className="btn" disabled={busy || !ready}
          onClick={() => { setProblem(null); submit(); }}>{label}</button>
        {back && <button className="btn ghost" disabled={busy} onClick={back}>{t('cancel')}</button>}
      </div>
    </>
  );

  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card till-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="till-hd">
          <h3>{title}</h3>
          <button className="till-x" onClick={onClose} aria-label={t('cancel')}>✕</button>
        </div>

        {/* ---------------- closed: the morning count ---------------- */}
        {mode === 'menu' && !session && (
          <div className="till-body">
            {canCount ? (
              <>
                {ask(() => openTill.mutate(), t('openBtn'))}
                <Past branchId={branchId} t={t} />
              </>
            ) : (
              <p className="till-note">{t('needPayments')}</p>
            )}
          </div>
        )}

        {/* ---------------- open: the day so far ---------------- */}
        {mode === 'menu' && session && (
          <div className="till-body">
            {state.expectedCash != null ? (
              <Hero label={t('expectedNow')} who={who(session, t)}>
                <Money value={state.expectedCash} />
              </Hero>
            ) : (
              <Hero label={t('ordersSoFar')} who={who(session, t)}>{state.orderCount}</Hero>
            )}

            {canCount && (
              <dl className="till-ledger">
                <div><dt>{t('floatIn')}</dt><dd><Money value={session.openingFloat} /></dd></div>
                {state.cashTaken != null && (
                  <div><dt>{t('cashSoFar')}</dt><dd><Money value={state.cashTaken} /></dd></div>
                )}
                {state.cardTaken != null && (
                  <div className="till-cut"><dt>{t('cardSoFar')}</dt><dd><Money value={state.cardTaken} /></dd></div>
                )}
                <div><dt>{t('ordersSoFar')}</dt><dd>{state.orderCount}</dd></div>
              </dl>
            )}

            {canCount && (
              <div className="till-actions">
                <button className="btn ghost" disabled={busy}
                  onClick={() => { setProblem(null); setCash(''); setMode('close'); }}>
                  {t('closeT')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ---------------- closing: the night count ---------------- */}
        {mode === 'close' && (
          <div className="till-body">
            {ask(() => closeTill.mutate(), t('closeBtn'), () => { setCash(''); setMode('menu'); })}
          </div>
        )}

        {/* ---------------- what the count came to ---------------- */}
        {mode === 'result' && result && (
          <div className="till-body">
            <Hero label={t('diff')} tone={gapOf(result.variance ?? 0)} answer>
              <Gap variance={result.variance ?? 0} t={t} />
            </Hero>
            <dl className="till-ledger">
              <div><dt>{t('counted')}</dt><dd><Money value={result.countedCash ?? 0} /></dd></div>
              <div className="till-cut"><dt>{t('expected')}</dt><dd><Money value={result.expectedCash ?? 0} /></dd></div>
              <div><dt>{t('cashSales')}</dt><dd><Money value={result.cashSales ?? 0} /></dd></div>
              <div><dt>{t('cardSales')}</dt><dd><Money value={result.cardSales ?? 0} /></dd></div>
              <div><dt>{t('ordersDone')}</dt><dd>{result.orderCount ?? 0}</dd></div>
            </dl>
            <div className="till-actions">
              <button className="btn" onClick={onClose}>{t('done')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Who opened the drawer and how long ago, or just how long ago when nobody is named. */
const who = (session: TillSession, t: T) => session.openedBy
  ? fill(t('openedBy'), { who: session.openedBy, t: openFor(session.openedAt, t) })
  : fill(t('openedAt'), { t: openFor(session.openedAt, t) });

/** The one figure the screen is about, said at the top of it. */
function Hero({ label, children, who, tone, answer }: {
  label: string; children: ReactNode; who?: string;
  tone?: 'exact' | 'short' | 'over'; answer?: boolean;
}) {
  return (
    <div className={['till-hero', tone, answer && 'is-answer'].filter(Boolean).join(' ')}>
      <span>{label}</span>
      <p className="till-hero-fig">{children}</p>
      {who && <p className="till-hero-who">{who}</p>}
    </div>
  );
}

/**
 * The line the count is written on.
 *
 * <p>Typed in the same face and size the till answers in, because a person's figure and the
 * till's are the same kind of thing. Digits and one dot only: a number keypad on a phone
 * offers a comma in Arabic, and 12,500 is not 12.500.
 */
function CashLine({ label, value, onChange, onEnter }: {
  label: string; value: string; onChange: (v: string) => void; onEnter: () => void;
}) {
  return (
    <label className="till-hero">
      <span>{label}</span>
      <span className="till-hero-in">
        <span className="money__symbol" aria-hidden="true" style={{
          WebkitMaskImage: `url("${omrSymbolUrl}")`, maskImage: `url("${omrSymbolUrl}")`,
        }} />
        <input
          type="text" inputMode="decimal" dir="ltr" autoFocus placeholder="0.000"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(',', '.').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))}
          onKeyDown={(e) => { if (e.key === 'Enter') onEnter(); }}
        />
      </span>
    </label>
  );
}

/** The last few nights, one line each — where "we were short again" is visible. */
function Past({ branchId, t }: { branchId: number; t: T }) {
  const { lang } = useI18n();
  const pastQ = useQuery({
    queryKey: ['till-sessions', branchId],
    queryFn: () => api.get<TillSession[]>(`/api/branches/${branchId}/till/sessions`),
  });
  if (!pastQ.data) return null;
  const closes = pastQ.data.filter((s) => s.closedAt).slice(0, 5);
  return (
    <div className="till-past">
      <span>{t('recent')}</span>
      {closes.length === 0 && <p>{t('noHistory')}</p>}
      {closes.map((s) => (
        <div className="till-past-row" key={s.id}>
          <time dateTime={s.closedAt!}>
            {new Date(s.closedAt!).toLocaleDateString(lang === 'ar' ? 'ar-OM' : 'en-GB',
              { day: 'numeric', month: 'short' })}
          </time>
          <span>{s.closedBy ?? '—'}</span>
          <b className={gapOf(s.variance ?? 0)}><Gap variance={s.variance ?? 0} t={t} /></b>
        </div>
      ))}
    </div>
  );
}
