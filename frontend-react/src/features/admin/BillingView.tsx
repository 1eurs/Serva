// The money screen: what the platform earns, what it collected, and who owes.
//
// Before this, "is anyone overdue?" meant opening every café's drawer one at a time, and
// "they sent the transfer" had nowhere to be written down — the subscription had a reference
// column nothing ever filled in. Recording a payment here files it in the ledger *and* rolls
// the café's term forward, so the two can never disagree.
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { useI18n, useT, nameOf } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import { omr } from '../../lib/format';
import type { BillingOverview, BillingRow, SubscriptionPayment } from '../../lib/types';
import { DICT } from './dict';
import { Kpi, SUB_CLASS, hue, isoDate, planLabelKey } from './shared';

type Queue = 'all' | 'overdue' | 'expiring' | 'trial' | 'active';

const QUEUES: { key: Queue; label: string }[] = [
  { key: 'all', label: 'billQAll' },
  { key: 'overdue', label: 'billQOverdue' },
  { key: 'expiring', label: 'billQExpiring' },
  { key: 'trial', label: 'billQTrial' },
  { key: 'active', label: 'billQActive' },
];

/** Which queue a line belongs to. Overdue wins over everything: it is the one that costs money. */
const inQueue = (r: BillingRow, q: Queue) => {
  if (q === 'all') return true;
  // A cancelled café owes nothing, however long ago its term ended.
  if (q === 'overdue') return r.status !== 'CANCELLED'
    && (r.status === 'PAST_DUE' || r.status === 'EXPIRED' || (r.daysLeft != null && r.daysLeft < 0));
  if (q === 'expiring') return r.daysLeft != null && r.daysLeft >= 0 && r.daysLeft <= 14
    && (r.status === 'ACTIVE' || r.status === 'TRIAL');
  if (q === 'trial') return r.status === 'TRIAL';
  return r.status === 'ACTIVE';
};

export default function BillingView({ onOpenCafe, focus = null, onClearFocus }: {
  onOpenCafe: (restaurantId: number) => void;
  /** A café carried in from its drawer: narrow to its line and show what it has paid. */
  focus?: number | null;
  onClearFocus?: () => void;
}) {
  const t = useT(DICT);
  const { lang } = useI18n();
  const [queue, setQueue] = useState<Queue>('all');
  const [paying, setPaying] = useState<BillingRow | null>(null);

  const { data } = useQuery({
    queryKey: ['admin-billing'],
    queryFn: () => api.get<BillingOverview>('/api/admin/billing'),
    refetchInterval: 120_000,
  });

  // A focused café ignores the queue tabs: it was reached from its own drawer, so the question
  // is "what about this one", not "which of them are overdue".
  const rows = useMemo(() => (data?.rows ?? []).filter((r) =>
    focus != null ? r.restaurantId === focus : inQueue(r, queue)), [data, queue, focus]);
  const focusRow = focus == null ? null : (data?.rows ?? []).find((r) => r.restaurantId === focus) ?? null;
  const monthDelta = data && data.collectedLastMonth > 0
    ? Math.round(((data.collectedThisMonth - data.collectedLastMonth) / data.collectedLastMonth) * 100)
    : null;

  return (
    <div className="acontent">
      <div className="kpis">
        <Kpi color="var(--green)" label={t('billMrr')} val={`${omr(data?.mrr ?? 0)} ${t('cur')}`}
          hint={`${t('billArr')} ${omr(data?.arr ?? 0)}`} />
        <Kpi color="var(--accent)" label={t('billThisMonth')} val={`${omr(data?.collectedThisMonth ?? 0)} ${t('cur')}`}
          hint={monthDelta == null ? undefined
            : `${monthDelta >= 0 ? '▲' : '▼'} ${Math.abs(monthDelta)}% ${t('billLastMonth')}`} />
        <Kpi color="var(--bad)" label={t('billOutstanding')} val={`${omr(data?.outstanding ?? 0)} ${t('cur')}`}
          hint={(data?.pastDueCount ?? 0) + (data?.expiredCount ?? 0) > 0
            ? `${(data?.pastDueCount ?? 0) + (data?.expiredCount ?? 0)} ${t('billQOverdue').toLowerCase()}`
            : undefined} />
        <Kpi color="var(--amber)" label={t('billQExpiring')} val={data?.expiringSoonCount ?? 0} />
        <Kpi color="var(--blue)" label={t('billQTrial')} val={data?.trialCount ?? 0} />
        <Kpi color="var(--green)" label={t('billQActive')} val={data?.activeCount ?? 0} />
      </div>

      {focus != null ? (
        <div className="focus-bar">
          <span className="fb-t">{t('billForCafe')}</span>
          <span className="fb-n" dir="auto">{focusRow ? nameOf(focusRow, lang) : `#${focus}`}</span>
          <div className="spacer" style={{ flex: 1 }} />
          <button className="btn sm ghost" onClick={onClearFocus}>{t('billClearFocus')}</button>
        </div>
      ) : (
        <div className="toolbar">
          <div className="seg">
            {QUEUES.map((q) => (
              <button key={q.key} className={queue === q.key ? 'on' : ''} onClick={() => setQueue(q.key)}>
                {t(q.label)}
              </button>
            ))}
          </div>
          <div className="spacer" style={{ flex: 1 }} />
          <span className="rslug">{rows.length} {t('of')} {data?.rows.length ?? 0}</span>
        </div>
      )}

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr>
            <th>{t('billCafe')}</th>
            <th className="hide-xs">{t('billPlan')}</th>
            <th className="hide-xs">{t('billPrice')}</th>
            <th>{t('billEnds')}</th>
            <th className="hide-sm">{t('billLastPaid')}</th>
            <th className="hide-sm">{t('billPaidTotal')}</th>
            <th>{t('status')}</th>
            <th />
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.subscriptionId} onClick={() => onOpenCafe(r.restaurantId)}>
                <td>
                  <div className="rcell">
                    <div className="rlogo" style={{ background: hue(r.restaurantId) }}>
                      {nameOf(r, lang).charAt(0)}
                    </div>
                    <div>
                      <div className="rname" dir="auto">{nameOf(r, lang)}</div>
                      <div className="rslug">{r.slug}{!r.restaurantActive ? ` · ${t('inactive')}` : ''}</div>
                    </div>
                  </div>
                </td>
                {/* Tier and cycle are two different questions; they used to share one string. */}
                <td className="hide-xs">{t(planLabelKey(r.tier))}<div className="rslug">{t(`cyc_${r.billingCycle}`)}</div></td>
                <td className="hide-xs"><span className="num">{omr(r.price)}</span>
                  <div className="rslug num">{omr(r.monthlyValue)}{t('perMo')}</div></td>
                <td><ExpiryCell row={r} t={t} /></td>
                <td className="hide-sm num">{r.lastPaidOn ?? t('none')}</td>
                <td className="hide-sm num">{omr(r.paidTotal)}</td>
                <td><span className={'chip ' + SUB_CLASS(r.status)}><span className="d" />{t(`sub${r.status}`)}</span></td>
                <td>
                  <button className="btn sm" onClick={(e) => { e.stopPropagation(); setPaying(r); }}>
                    {t('billRecord')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {focusRow && <CafePayments row={focusRow} t={t} />}

      {paying && <RecordPaymentModal row={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}

/** What one café has actually paid — the ledger the drawer used to show read-only. */
function CafePayments({ row, t }: { row: BillingRow; t: (k: string) => string }) {
  const { data: payments = [] } = useQuery({
    queryKey: ['admin-payments', row.restaurantId],
    queryFn: () => api.get<SubscriptionPayment[]>(`/api/admin/restaurants/${row.restaurantId}/payments`),
  });
  return (
    <div className="sect" style={{ marginTop: 18 }}>
      <h4>{t('billHistory')}<span className="sect-count">{payments.length}</span></h4>
      {payments.length === 0 ? (
        <div className="subbox" style={{ color: 'var(--faint)', fontSize: 13 }}>{t('billNoPayments')}</div>
      ) : (
        <div className="paylist">
          {payments.map((p) => (
            <div className="payrow" key={p.id}>
              <span className="num">{p.paidOn}</span>
              <span className={'num' + (p.amount < 0 ? ' neg' : '')}>{omr(p.amount)} {t('cur')}</span>
              <span className="rslug" dir="auto">{p.reference ?? p.note ?? ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExpiryCell({ row, t }: { row: BillingRow; t: (k: string) => string }) {
  if (row.daysLeft == null) return <span className="num">{t('lifetime')}</span>;
  const cls = row.daysLeft < 0 ? 'bad' : row.daysLeft <= 14 ? 'warn' : 'ok';
  return (
    <>
      <div className="num">{row.endDate}</div>
      <div className="expiry">
        <span className={'chip ' + cls}>
          <span className="d" />
          {row.daysLeft < 0
            ? `${Math.abs(row.daysLeft)}${t('billDaysLeft')} ${t('billOverdueBy')}`
            : `${row.daysLeft}${t('billDaysLeft')}`}
        </span>
      </div>
    </>
  );
}

function RecordPaymentModal({ row, onClose }: { row: BillingRow; onClose: () => void }) {
  const t = useT(DICT);
  const { lang } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();

  const [amount, setAmount] = useState(String(row.price ?? ''));
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(isoDate());
  const [note, setNote] = useState('');
  const [extendTerm, setExtendTerm] = useState(true);

  const { data: history = [] } = useQuery({
    queryKey: ['admin-payments', row.restaurantId],
    queryFn: () => api.get<SubscriptionPayment[]>(`/api/admin/restaurants/${row.restaurantId}/payments`),
  });

  const save = useMutation({
    mutationFn: () => api.post(`/api/admin/subscriptions/${row.subscriptionId}/payments`, {
      amount: Number(amount),
      method: 'BANK_TRANSFER',
      reference: reference.trim() || undefined,
      paidOn,
      note: note.trim() || undefined,
      extendTerm,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-billing'] });
      qc.invalidateQueries({ queryKey: ['admin-payments', row.restaurantId] });
      qc.invalidateQueries({ queryKey: ['sub', row.restaurantId] });
      qc.invalidateQueries({ queryKey: ['admin-restaurants'] });
      toast(t('billSaved'));
      onClose();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  const valid = amount.trim() !== '' && !Number.isNaN(Number(amount));

  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <h3>{t('billRecordT')}</h3>
        <div className="ph">{nameOf(row, lang)} · {t(planLabelKey(row.tier))}</div>

        <div className="row2">
          <div className="field"><label>{t('billAmount')}</label>
            <input className="num" dir="ltr" value={amount} inputMode="decimal"
              onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="field"><label>{t('billPaidOn')}</label>
            <input className="num" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></div>
        </div>
        <div className="ph" style={{ marginTop: -4 }}>{t('billRefund')}</div>

        <div className="field"><label>{t('billRef')}</label>
          <input className="num" dir="ltr" value={reference} placeholder="TT-…"
            onChange={(e) => setReference(e.target.value)} /></div>
        <div className="field"><label>{t('billNote')}</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} /></div>

        <label className="wiz-toggle">
          <input type="checkbox" checked={extendTerm} onChange={(e) => setExtendTerm(e.target.checked)} />
          <span>{t('billExtend')}</span>
        </label>
        <div className="ph">{t('billExtendHint')}</div>

        <div className="sect" style={{ marginTop: 14 }}>
          <h4>{t('billHistory')}<span className="sect-count">{history.length}</span></h4>
          {history.length === 0 ? (
            <div className="subbox" style={{ color: 'var(--faint)', fontSize: 13 }}>{t('billNoPayments')}</div>
          ) : (
            <div className="paylist">
              {history.map((p) => (
                <div className="payrow" key={p.id}>
                  <span className="num">{p.paidOn}</span>
                  <span className={'num' + (p.amount < 0 ? ' neg' : '')}>{omr(p.amount)} {t('cur')}</span>
                  <span className="rslug">{p.reference ?? p.note ?? ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>{t('cancel')}</button>
          <button className="btn" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? '…' : t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}
