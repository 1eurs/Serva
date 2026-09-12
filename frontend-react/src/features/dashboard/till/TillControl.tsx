import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../../lib/api';
import { useAuth, can } from '../../../lib/auth';
import { useI18n, useT } from '../../../lib/i18n';
import { Money } from '../../../lib/Money';
import { useToast } from '../../../lib/toast';
import type { TillSession, TillState } from '../../../lib/types';
import { DICT, fill } from './copy';
import './till.css';

type T = (k: string) => string;
type Mode = 'menu' | 'close' | 'result';

/** How long the drawer has been open, in the biggest unit that fits. */
const openFor = (iso: string, t: T): string => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins}${t('minShort')}`;
  const hours = Math.floor(mins / 60);
  return hours < 24 ? `${hours}${t('hourShort')}` : `${Math.floor(hours / 24)}${t('dayShort')}`;
};

/** The word for the gap, and the class that colours it. */
const gap = (variance: number, t: T) => ({
  cls: variance === 0 ? 'exact' : variance < 0 ? 'short' : 'over',
  word: variance === 0 ? t('exact') : fill(t(variance < 0 ? 'short' : 'over'), { v: Math.abs(variance).toFixed(3) }),
});

/**
 * The till, from the header.
 *
 * <p>Three states on the shop sign: selling, paused, closed. Behind it, two numbers a café
 * already knows — what was in the drawer this morning and what is in it tonight — and the
 * difference between them and what the day's cash sales say there should be.
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
  const paused = state.open && !state.acceptingOrders;
  const label = closed ? t('stClosed') : paused ? t('stPaused') : t('stOpen');

  return (
    <>
      <button
        type="button"
        className={'order-status-toggle' + (closed ? ' shut' : paused ? ' paused' : '')}
        aria-label={`${t('till')} — ${label}`}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={sheet}
        onClick={() => setSheet(true)}
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
  const [float, setFloat] = useState('');
  const [counted, setCounted] = useState('');
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
      { openingFloat: Number(float || 0) }),
    onSuccess: () => { onChanged(); toast(t('openedToast')); onClose(); },
    onError: fail,
  });

  const closeTill = useMutation({
    mutationFn: () => api.post<TillSession>(`/api/branches/${branchId}/till/close`,
      { countedCash: Number(counted || 0) }),
    onSuccess: (session) => { onChanged(); toast(t('closedToast')); setResult(session); setMode('result'); },
    onError: fail,
  });

  const setOrdering = useMutation({
    mutationFn: (acceptingOrders: boolean) =>
      api.patch(`/api/branches/${branchId}/ordering-status`, { acceptingOrders }),
    onSuccess: (_d, acceptingOrders) => {
      onChanged();
      toast(t(acceptingOrders ? 'resumedToast' : 'pausedToast'));
      onClose();
    },
    onError: fail,
  });

  const busy = openTill.isPending || closeTill.isPending || setOrdering.isPending;
  const session = state.session;
  const paused = state.open && !state.acceptingOrders;
  const title = mode === 'close' ? t('closeT') : mode === 'result' ? t('resultT') : t('till');

  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card till-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="till-hd">
          <h3>{title}</h3>
          <button className="till-x" onClick={onClose} aria-label={t('cancel')}>✕</button>
        </div>

        {problem && <p className="till-problem" role="alert">{problem}</p>}

        {/* ---------------- closed: what is in the drawer this morning ---------------- */}
        {mode === 'menu' && !session && (
          <div className="till-body">
            {canCount ? (
              <>
                <label className="till-field">
                  <span>{t('floatLabel')}</span>
                  <input className="num" type="number" inputMode="decimal" min="0" step="0.001" dir="ltr"
                    autoFocus value={float} onChange={(e) => setFloat(e.target.value)} />
                </label>
                <div className="till-actions">
                  <button className="btn" disabled={busy || float.trim() === ''}
                    onClick={() => { setProblem(null); openTill.mutate(); }}>{t('openBtn')}</button>
                </div>
                <History branchId={branchId} t={t} />
              </>
            ) : (
              <p className="till-note">{t('needPayments')}</p>
            )}
          </div>
        )}

        {/* ---------------- open: the day so far ---------------- */}
        {mode === 'menu' && session && (
          <div className="till-body">
            <div className="till-open-card">
              <p className="till-who">{session.openedBy
                ? fill(t('openedBy'), { who: session.openedBy, t: openFor(session.openedAt, t) })
                : fill(t('openedAt'), { t: openFor(session.openedAt, t) })}</p>
              <dl className="till-figs">
                {canCount && <div><dt>{t('floatIn')}</dt><dd><Money value={session.openingFloat} /></dd></div>}
                {state.cashTaken != null && (
                  <div><dt>{t('cashSoFar')}</dt><dd><Money value={state.cashTaken} /></dd></div>
                )}
                {state.cardTaken != null && (
                  <div><dt>{t('cardSoFar')}</dt><dd><Money value={state.cardTaken} /></dd></div>
                )}
                <div><dt>{t('ordersSoFar')}</dt><dd className="till-plain">{state.orderCount}</dd></div>
                {state.expectedCash != null && (
                  <div className="till-expected">
                    <dt>{t('expectedNow')}</dt><dd><Money value={state.expectedCash} /></dd>
                  </div>
                )}
              </dl>
            </div>

            <div className="till-actions">
              <button className={'btn' + (paused ? '' : ' ghost')} disabled={busy}
                onClick={() => setOrdering.mutate(paused)}>
                {t(paused ? 'resumeBtn' : 'pauseBtn')}
              </button>
              {canCount && (
                <button className="btn ghost" onClick={() => { setProblem(null); setMode('close'); }}>
                  {t('closeT')}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ---------------- closing: what is in the drawer tonight ---------------- */}
        {mode === 'close' && (
          <div className="till-body">
            <label className="till-field">
              <span>{t('countLabel')}</span>
              <input className="num" type="number" inputMode="decimal" min="0" step="0.001" dir="ltr"
                autoFocus value={counted} onChange={(e) => setCounted(e.target.value)} />
            </label>
            <div className="till-actions">
              <button className="btn" disabled={busy || counted.trim() === ''}
                onClick={() => { setProblem(null); closeTill.mutate(); }}>{t('closeBtn')}</button>
              <button className="btn ghost" onClick={() => setMode('menu')}>{t('cancel')}</button>
            </div>
          </div>
        )}

        {/* ---------------- what the count came to ---------------- */}
        {mode === 'result' && result && (
          <div className="till-body">
            <CountResult session={result} t={t} />
            <div className="till-actions">
              <button className="btn" onClick={onClose}>{t('done')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Counted against expected, and the word for the gap. */
function CountResult({ session, t }: { session: TillSession; t: T }) {
  const { cls, word } = gap(session.variance ?? 0, t);
  return (
    <div className={'till-result ' + cls}>
      <dl className="till-figs">
        <div><dt>{t('counted')}</dt><dd><Money value={session.countedCash ?? 0} /></dd></div>
        <div><dt>{t('expected')}</dt><dd><Money value={session.expectedCash ?? 0} /></dd></div>
        <div className="till-diff"><dt>{t('diff')}</dt><dd>{word}</dd></div>
      </dl>
      <dl className="till-figs sub">
        <div><dt>{t('cashSales')}</dt><dd><Money value={session.cashSales ?? 0} /></dd></div>
        <div><dt>{t('cardSales')}</dt><dd><Money value={session.cardSales ?? 0} /></dd></div>
        <div><dt>{t('ordersDone')}</dt><dd className="till-plain">{session.orderCount ?? 0}</dd></div>
      </dl>
    </div>
  );
}

/** The last few nights, one line each — where "we were 2 short again" is visible. */
function History({ branchId, t }: { branchId: number; t: T }) {
  const { lang } = useI18n();
  const historyQ = useQuery({
    queryKey: ['till-sessions', branchId],
    queryFn: () => api.get<TillSession[]>(`/api/branches/${branchId}/till/sessions`),
  });
  const closes = (historyQ.data ?? []).filter((s) => s.closedAt).slice(0, 7);
  if (!historyQ.data) return null;
  return (
    <div className="till-history">
      <p className="till-history-k">{t('recent')}</p>
      {closes.length === 0 && <p className="till-hint">{t('noHistory')}</p>}
      {closes.map((s) => {
        const { cls, word } = gap(s.variance ?? 0, t);
        return (
          <div key={s.id} className={'till-history-row ' + cls}>
            <span className="till-h-when">
              {new Date(s.closedAt!).toLocaleDateString(lang === 'ar' ? 'ar-OM' : 'en-GB',
                { day: 'numeric', month: 'short' })}
            </span>
            <span className="till-h-who">{s.closedBy ?? '—'}</span>
            <b>{word}</b>
          </div>
        );
      })}
    </div>
  );
}
