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
type Mode = 'menu' | 'open' | 'close' | 'result';

/** Minutes left on a timed pause, or null when it isn't one. */
const minutesLeft = (until?: string | null): number | null => {
  if (!until) return null;
  const mins = Math.ceil((new Date(until).getTime() - Date.now()) / 60_000);
  return mins > 0 ? mins : null;
};

/** How long the drawer has been open, in the only two units a shift needs. */
const openFor = (iso: string, t: T): string => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return mins < 60 ? `${mins}${t('minShort')}` : `${Math.floor(mins / 60)}${t('hourShort')}`;
};

/**
 * The till, from the header.
 *
 * <p>This used to be a switch that set a boolean, and it read as one: staff flipped it, nothing
 * recorded that they had, and "accepting orders" meant no more than somebody having last tapped
 * it that way. It is now the drawer. Opening the till counts the float and opens the shop;
 * closing it counts the cash and shuts the shop; pausing is the break in between, which the
 * till survives.
 *
 * <p>So the button has three states rather than two, and the third is the one that was missing:
 * closed is not a stronger pause, it is the shop being shut with a counted drawer behind it.
 */
export default function TillControl({ branchId }: { branchId?: number }) {
  const t = useT(DICT);
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [sheet, setSheet] = useState(false);
  const [, tick] = useState(0);

  const stateQ = useQuery({
    queryKey: ['till', branchId],
    queryFn: () => api.get<TillState>(`/api/branches/${branchId}/till`),
    enabled: branchId != null,
    // Another tablet can open or close this same drawer, and a timed pause lifts itself with
    // nothing to announce it. A minute of staleness on a shop sign is the tolerable amount.
    refetchInterval: 60_000,
  });
  const state = stateQ.data;

  // A pause with a clock on it has to visibly run down, or the countdown is a screenshot.
  const paused = !!state && !state.acceptingOrders && state.open;
  useEffect(() => {
    if (!paused || !state?.pauseUntil) return;
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [paused, state?.pauseUntil]);

  if (branchId == null || !state) return null;

  const closed = state.tillEnabled && !state.open;
  const left = minutesLeft(state.pauseUntil);
  const label = closed ? t('stClosed')
    : paused ? (left ? fill(t('pausedLeft'), { t: `${left}${t('minShort')}` }) : t('stPaused'))
    : t('stOpen');

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
  const { lang } = useI18n();
  const [mode, setMode] = useState<Mode>('menu');
  const [float, setFloat] = useState(() =>
    state.suggestedFloat != null ? String(state.suggestedFloat) : '');
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
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
      { countedCash: Number(counted || 0), note: note.trim() || null }),
    onSuccess: (session) => { onChanged(); toast(t('closedToast')); setResult(session); setMode('result'); },
    onError: fail,
  });

  const setOrdering = useMutation({
    mutationFn: (body: { acceptingOrders: boolean; pauseMinutes: number | null }) =>
      api.patch(`/api/branches/${branchId}/ordering-status`, body),
    onSuccess: (_d, body) => {
      onChanged();
      toast(t(body.acceptingOrders ? 'resumedToast' : 'pausedToast'));
      onClose();
    },
    onError: fail,
  });

  const busy = openTill.isPending || closeTill.isPending || setOrdering.isPending;
  const session = state.session;
  const closed = state.tillEnabled && !state.open;
  const paused = !state.acceptingOrders && state.open;
  const title = mode === 'open' ? t('openT')
    : mode === 'close' ? t('closeT')
    : mode === 'result' ? t('resultT')
    : t('till');

  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card till-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="till-hd">
          <h3>{title}</h3>
          <button className="till-x" onClick={onClose} aria-label={t('cancel')}>✕</button>
        </div>

        {problem && <p className="till-problem" role="alert">{problem}</p>}

        {/* ---------------- the drawer as it stands ---------------- */}
        {mode === 'menu' && (
          <div className="till-body">
            {!state.tillEnabled && <p className="till-note">{t('tillOff')}</p>}

            {state.tillEnabled && closed && (
              <p className="till-note">{t('closedBlocks')}</p>
            )}

            {session && (
              <div className="till-open-card">
                <div className="till-who">
                  <b>{session.openedBy
                    ? fill(t('openedBy'), { who: session.openedBy })
                    : t('openedByNobody')}</b>
                  <span>{fill(t('openedAt'), { t: openFor(session.openedAt, t) })}</span>
                </div>
                <dl className="till-figs">
                  <div><dt>{t('floatIn')}</dt><dd><Money value={session.openingFloat} /></dd></div>
                  <div><dt>{t('ordersSoFar')}</dt><dd className="till-plain">{state.orderCount}</dd></div>
                  {state.cardTaken != null && (
                    <div><dt>{t('cardSoFar')}</dt><dd><Money value={state.cardTaken} /></dd></div>
                  )}
                  {state.cashTaken != null && (
                    <div><dt>{t('cashSoFar')}</dt><dd><Money value={state.cashTaken} /></dd></div>
                  )}
                  {state.expectedCash != null && (
                    <div className="till-expected">
                      <dt>{t('expectedNow')}</dt><dd><Money value={state.expectedCash} /></dd>
                    </div>
                  )}
                </dl>
                {state.blindCount && canCount && <p className="till-hint">{t('blindHint')}</p>}
                {state.openTabs > 0 && (
                  <p className="till-hint">{fill(t('openTabs'), { n: state.openTabs })}</p>
                )}
              </div>
            )}

            {state.lastClose?.closedAt && <LastClose session={state.lastClose} t={t} lang={lang} />}

            <div className="till-actions">
              {closed && canCount && (
                <button className="btn" onClick={() => { setProblem(null); setMode('open'); }}>
                  {t('openT')}
                </button>
              )}
              {closed && !canCount && <p className="till-note">{t('needPayments')}</p>}

              {!closed && paused && (
                <button className="btn" disabled={busy}
                  onClick={() => setOrdering.mutate({ acceptingOrders: true, pauseMinutes: null })}>
                  {t('resumeBtn')}
                </button>
              )}
              {!closed && !paused && (
                <PauseRow t={t} busy={busy}
                  onPause={(minutes) => setOrdering.mutate({ acceptingOrders: false, pauseMinutes: minutes })} />
              )}
              {/* Gated on there being a session rather than on the setting: a café that turns
                  the till off mid-shift still has a counted drawer open, and it has to be
                  closeable properly rather than stranded by a switch in Settings. */}
              {session && canCount && (
                <button className="btn ghost" onClick={() => { setProblem(null); setMode('close'); }}>
                  {t('closeT')}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ---------------- opening ---------------- */}
        {mode === 'open' && (
          <div className="till-body">
            <p className="till-sub">{t('openS')}</p>
            <label className="till-field">
              <span>{t('floatLabel')}</span>
              <input className="num" type="number" inputMode="decimal" min="0" step="0.001" dir="ltr"
                autoFocus value={float} onChange={(e) => setFloat(e.target.value)} />
            </label>
            {state.suggestedFloat != null && (
              <p className="till-hint">
                {fill(t('floatCarried'), { v: state.suggestedFloat.toFixed(3) })}
              </p>
            )}
            <div className="till-actions">
              <button className="btn" disabled={busy || float.trim() === ''}
                onClick={() => { setProblem(null); openTill.mutate(); }}>{t('openBtn')}</button>
              <button className="btn ghost" onClick={() => setMode('menu')}>{t('cancel')}</button>
            </div>
          </div>
        )}

        {/* ---------------- closing ---------------- */}
        {mode === 'close' && (
          <div className="till-body">
            <p className="till-sub">{t('closeS')}</p>
            {state.openTabs > 0 && (
              <p className="till-warn">{fill(t('closeWarnTabs'), { n: state.openTabs })}</p>
            )}
            <label className="till-field">
              <span>{t('countLabel')}</span>
              <input className="num" type="number" inputMode="decimal" min="0" step="0.001" dir="ltr"
                autoFocus value={counted} onChange={(e) => setCounted(e.target.value)} />
            </label>
            {/* Optional until the drawer turns out to be out by more than the café's threshold,
                which under a blind count nobody can know before submitting — so the field is
                here from the start rather than appearing as a scolding. */}
            <label className="till-field">
              <span>{t('noteLabel')}</span>
              <textarea rows={2} value={note} placeholder={t('notePlaceholder')}
                onChange={(e) => setNote(e.target.value)} />
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

/**
 * How long to pause for. The durations are the point: a pause with an end on it is one nobody
 * has to remember to undo, and "until I resume" is kept last rather than made the default.
 */
function PauseRow({ t, busy, onPause }: { t: T; busy: boolean; onPause: (m: number | null) => void }) {
  const [openRow, setOpenRow] = useState(false);
  if (!openRow) {
    return (
      <button className="btn ghost" disabled={busy} onClick={() => setOpenRow(true)}>{t('pauseBtn')}</button>
    );
  }
  return (
    <div className="till-pause">
      <p className="till-sub">{t('pauseS')}</p>
      <div className="till-pause-row">
        <button className="chip" disabled={busy} onClick={() => onPause(15)}>{t('pause15')}</button>
        <button className="chip" disabled={busy} onClick={() => onPause(30)}>{t('pause30')}</button>
        <button className="chip" disabled={busy} onClick={() => onPause(60)}>{t('pause60')}</button>
        <button className="chip" disabled={busy} onClick={() => onPause(null)}>{t('pauseOpen')}</button>
      </div>
    </div>
  );
}

/** Counted against expected, and the word for the gap. */
function CountResult({ session, t }: { session: TillSession; t: T }) {
  const variance = session.variance ?? 0;
  const state = variance === 0 ? 'exact' : variance < 0 ? 'short' : 'over';
  return (
    <div className={'till-result ' + state}>
      <dl className="till-figs">
        <div><dt>{t('counted')}</dt><dd><Money value={session.countedCash ?? 0} /></dd></div>
        <div><dt>{t('expected')}</dt><dd><Money value={session.expectedCash ?? 0} /></dd></div>
        <div className="till-diff">
          <dt>{t('diff')}</dt>
          <dd>{variance === 0
            ? t('exact')
            : fill(t(variance < 0 ? 'short' : 'over'), { v: Math.abs(variance).toFixed(3) })}</dd>
        </div>
      </dl>
      <dl className="till-figs sub">
        <div><dt>{t('cashSales')}</dt><dd><Money value={session.cashSales ?? 0} /></dd></div>
        <div><dt>{t('cardSales')}</dt><dd><Money value={session.cardSales ?? 0} /></dd></div>
        <div><dt>{t('ordersDone')}</dt><dd className="till-plain">{session.orderCount ?? 0}</dd></div>
      </dl>
      {session.closeNote && <p className="till-hint">“{session.closeNote}”</p>}
    </div>
  );
}

/** Last night, in one line — where "we were 2 short" is visible before it becomes a habit. */
function LastClose({ session, t, lang }: { session: TillSession; t: T; lang: string }) {
  const variance = session.variance ?? 0;
  const when = new Date(session.closedAt!).toLocaleDateString(lang === 'ar' ? 'ar-OM' : 'en-GB',
    { day: 'numeric', month: 'short' });
  return (
    <p className={'till-last ' + (variance === 0 ? 'exact' : variance < 0 ? 'short' : 'over')}>
      <span className="till-last-k">{t('lastClose')}</span>
      <span className="till-last-w">{when}</span>
      <b>{variance === 0
        ? t('exact')
        : fill(t(variance < 0 ? 'short' : 'over'), { v: Math.abs(variance).toFixed(3) })}</b>
    </p>
  );
}
