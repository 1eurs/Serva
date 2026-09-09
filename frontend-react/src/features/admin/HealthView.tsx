// Which cafés are in trouble, and which way the platform as a whole is going.
//
// A café that stopped ordering twelve days ago looks exactly like a healthy one in a list
// sorted by name, and a café whose volume halved looks fine right up until it churns. The
// radar sorts by how bad it is rather than alphabetically, and says why in one word.
import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { useI18n, useT, nameOf } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import { omr } from '../../lib/format';
import type { AdminRestaurantStats, BroadcastResult, Plan, PlatformTrendPoint, Restaurant } from '../../lib/types';
import { DICT } from './dict';
import { daysSince, hue, weekDelta } from './shared';

/** Days without a single order before a café counts as gone quiet. */
const SILENT_DAYS = 7;
/** A café this far below last week is shrinking, not just having a slow week. */
const DROP_PERCENT = -40;
/** Below this, a week-on-week percentage is noise — 1 order against 2 is not a 50% collapse. */
const DROP_FLOOR = 5;
/** How long a new café gets to place its first order before it counts as never started. */
const GRACE_DAYS = 14;

type Reason = 'whyNeverLive' | 'whySetup' | 'whySilent' | 'whyDropping';

interface RadarRow {
  cafe: Restaurant;
  stats?: AdminRestaurantStats;
  reason: Reason;
  /** Higher is worse — the sort key. */
  severity: number;
  detail: string;
}

export default function HealthView({ restaurants, stats, onOpenCafe }: {
  restaurants: Restaurant[];
  stats: Map<number, AdminRestaurantStats>;
  onOpenCafe: (restaurantId: number) => void;
}) {
  const t = useT(DICT);
  const { lang } = useI18n();
  const [days, setDays] = useState(90);
  const [broadcasting, setBroadcasting] = useState(false);

  const { data: trend = [] } = useQuery({
    queryKey: ['admin-trends', days],
    queryFn: () => api.get<PlatformTrendPoint[]>(`/api/admin/trends?days=${days}`),
  });

  const radar = useMemo<RadarRow[]>(() => {
    const rows: RadarRow[] = [];
    for (const cafe of restaurants) {
      if (!cafe.active) continue; // a café we switched off is not a surprise
      const s = stats.get(cafe.id);
      // A café with no creation date on file can't be judged on how long it has had to get
      // going, so it isn't accused of never starting.
      const age = cafe.createdAt ? daysSince(cafe.createdAt) : null;
      const quiet = daysSince(s?.lastOrderAt);
      const delta = weekDelta(s);

      // Ordered by how much it costs us to be wrong about it: a café that never started is a
      // failed onboarding, a silent one is churning now, a shrinking one is churning soon.
      if ((s?.ordersTotal ?? 0) === 0) {
        if (age == null || age < GRACE_DAYS) continue;
        const unfinished = (s?.menuItems ?? 0) === 0 || (s?.tables ?? 0) === 0 || (s?.branches ?? 0) === 0;
        rows.push({
          cafe, stats: s,
          reason: unfinished ? 'whySetup' : 'whyNeverLive',
          severity: 1000 + age,
          detail: `${age}${t('dayAgo')}`,
        });
      } else if (quiet !== Infinity && quiet >= SILENT_DAYS) {
        rows.push({ cafe, stats: s, reason: 'whySilent', severity: 500 + quiet, detail: `${quiet} ${t('healthDays')}` });
      } else if (delta != null && delta <= DROP_PERCENT && (s?.ordersPrev7d ?? 0) >= DROP_FLOOR) {
        rows.push({ cafe, stats: s, reason: 'whyDropping', severity: 100 + Math.abs(delta), detail: `${delta}% ${t('healthDrop')}` });
      }
    }
    return rows.sort((a, b) => b.severity - a.severity);
  }, [restaurants, stats, t]);

  return (
    <div className="acontent">
      <div className="toolbar">
        <div className="seg">
          {[30, 90, 365].map((d) => (
            <button key={d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>
              {t(d === 30 ? 'trend30' : d === 90 ? 'trend90' : 'trend365')}
            </button>
          ))}
        </div>
        <div className="spacer" style={{ flex: 1 }} />
        <button className="btn sm" onClick={() => setBroadcasting(true)}>{t('bcSend')}</button>
      </div>

      <TrendChart points={trend} t={t} />

      <div className="sect" style={{ marginTop: 22 }}>
        <h4>{t('healthRadar')}<span className="sect-count">{radar.length}</span></h4>
        <div className="ph" style={{ marginBottom: 12 }}>{t('healthRadarSub')}</div>

        {radar.length === 0 ? (
          <div className="subbox" style={{ color: 'var(--faint)', fontSize: 13 }}>{t('healthAllWell')}</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr>
                <th>{t('billCafe')}</th>
                <th>{t('healthWhy')}</th>
                <th>{t('thOrders30')}</th>
                <th className="hide-sm">{t('thRevenue30')}</th>
                <th className="hide-xs">{t('thLastOrder')}</th>
              </tr></thead>
              <tbody>
                {radar.map(({ cafe, stats: s, reason, detail }) => (
                  <tr key={cafe.id} onClick={() => onOpenCafe(cafe.id)}>
                    <td>
                      <div className="rcell">
                        <div className="rlogo" style={{ background: hue(cafe.id) }}>{nameOf(cafe, lang).charAt(0)}</div>
                        <div><div className="rname" dir="auto">{nameOf(cafe, lang)}</div><div className="rslug">{cafe.slug}</div></div>
                      </div>
                    </td>
                    <td>
                      <span className={'chip ' + (reason === 'whyDropping' ? 'warn' : 'bad')}>
                        <span className="d" />{t(reason)}
                      </span>
                      <div className="rslug">{detail}</div>
                    </td>
                    <td className="num">{s?.orders30d ?? 0}</td>
                    <td className="hide-sm num">{omr(Number(s?.revenue30d ?? 0))} {t('cur')}</td>
                    <td className="hide-xs num">{s?.lastOrderAt ? s.lastOrderAt.slice(0, 10) : t('never')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {broadcasting && <BroadcastModal onClose={() => setBroadcasting(false)} />}
    </div>
  );
}

/**
 * Orders as bars, revenue as a line over them, signups as ticks along the bottom.
 *
 * Hand-drawn SVG rather than a chart library: three series on one small canvas is less code
 * than configuring one, and it inherits the console's own colours instead of importing a theme.
 */
function TrendChart({ points, t }: { points: PlatformTrendPoint[]; t: (k: string) => string }) {
  const W = 1000;
  const H = 220;
  const PAD = 8;

  if (points.length === 0) {
    return <div className="subbox" style={{ color: 'var(--faint)', fontSize: 13 }}>{t('never')}</div>;
  }

  const maxOrders = Math.max(1, ...points.map((p) => p.orders));
  const maxRevenue = Math.max(1, ...points.map((p) => Number(p.revenue)));
  const barW = (W - PAD * 2) / points.length;
  const x = (i: number) => PAD + i * barW;
  const yOrders = (v: number) => H - PAD - (v / maxOrders) * (H - PAD * 2);
  const yRevenue = (v: number) => H - PAD - (v / maxRevenue) * (H - PAD * 2);

  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i) + barW / 2} ${yRevenue(Number(p.revenue))}`)
    .join(' ');

  const totals = points.reduce(
    (acc, p) => ({
      orders: acc.orders + p.orders,
      revenue: acc.revenue + Number(p.revenue),
      signups: acc.signups + p.newRestaurants,
    }),
    { orders: 0, revenue: 0, signups: 0 },
  );

  return (
    <div className="chart-card">
      <div className="chart-legend">
        <span><i className="sw bars" />{t('trendOrders')} <b className="num">{totals.orders}</b></span>
        <span><i className="sw line" />{t('trendRevenue')} <b className="num">{omr(totals.revenue)} {t('cur')}</b></span>
        <span><i className="sw dot" />{t('trendSignups')} <b className="num">{totals.signups}</b></span>
      </div>
      {/* Before the first order there is nothing to plot, and an empty grid with a flat line
          reads as a broken chart rather than as a quiet platform. Say so instead. */}
      {totals.orders === 0 && totals.revenue === 0 ? (
        <div className="chart-empty">{t('never')}</div>
      ) : (
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" preserveAspectRatio="none" role="img"
        aria-label={`${t('trendOrders')} / ${t('trendRevenue')}`}>
        {points.map((p, i) => (
          <rect key={p.day} x={x(i) + barW * 0.15} width={Math.max(1, barW * 0.7)}
            y={yOrders(p.orders)} height={Math.max(0, H - PAD - yOrders(p.orders))}
            className="c-bar">
            <title>{`${p.day} · ${p.orders}`}</title>
          </rect>
        ))}
        <path d={line} className="c-line" fill="none" />
        {points.map((p, i) => (p.newRestaurants === 0 ? null : (
          <circle key={`s-${p.day}`} cx={x(i) + barW / 2} cy={H - PAD} r={4} className="c-dot">
            <title>{`${p.day} · +${p.newRestaurants}`}</title>
          </circle>
        )))}
      </svg>
      )}
      <div className="chart-axis">
        <span className="num">{points[0].day}</span>
        <span className="num">{points[points.length - 1].day}</span>
      </div>
    </div>
  );
}

function BroadcastModal({ onClose }: { onClose: () => void }) {
  const t = useT(DICT);
  const toast = useToast();
  const [subjectEn, setSubjectEn] = useState('');
  const [subjectAr, setSubjectAr] = useState('');
  const [bodyEn, setBodyEn] = useState('');
  const [bodyAr, setBodyAr] = useState('');
  const [tier, setTier] = useState<Plan | ''>('');
  const [preview, setPreview] = useState<BroadcastResult | null>(null);

  const filled = !!(subjectEn.trim() && subjectAr.trim() && bodyEn.trim() && bodyAr.trim());
  const payload = (dryRun: boolean) => ({
    subjectEn: subjectEn.trim(), subjectAr: subjectAr.trim(),
    bodyEn: bodyEn.trim(), bodyAr: bodyAr.trim(),
    tier: tier || undefined, dryRun,
  });

  const send = useMutation({
    mutationFn: (dryRun: boolean) => api.post<BroadcastResult>('/api/admin/broadcast', payload(dryRun)),
    onSuccess: (result) => {
      setPreview(result);
      if (!result.dryRun) {
        toast(`${t('bcSent')} ${result.sent}`);
        onClose();
      }
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card wide">
        <h3>{t('bcTitle')}</h3>
        <div className="ph">{t('bcSub')}</div>

        <div className="row2">
          <div className="field"><label>{t('bcSubjEn')}</label>
            <input lang="en" dir="ltr" value={subjectEn} onChange={(e) => setSubjectEn(e.target.value)} /></div>
          <div className="field"><label>{t('bcSubjAr')}</label>
            <input lang="ar" dir="rtl" value={subjectAr} onChange={(e) => setSubjectAr(e.target.value)} /></div>
        </div>
        <div className="row2">
          <div className="field"><label>{t('bcBodyEn')}</label>
            <textarea lang="en" dir="ltr" rows={6} value={bodyEn} onChange={(e) => setBodyEn(e.target.value)} /></div>
          <div className="field"><label>{t('bcBodyAr')}</label>
            <textarea lang="ar" dir="rtl" rows={6} value={bodyAr} onChange={(e) => setBodyAr(e.target.value)} /></div>
        </div>

        <div className="field"><label>{t('bcTier')}</label>
          <div className="seg">
            <button type="button" className={tier === '' ? 'on' : ''} onClick={() => setTier('')}>{t('bcTierAll')}</button>
            {(['STANDARD', 'PRO', 'ENTERPRISE'] as Plan[]).map((p) => (
              <button key={p} type="button" className={tier === p ? 'on' : ''} onClick={() => setTier(p)}>
                {p === 'STANDARD' ? t('rPlanStd') : p === 'PRO' ? t('rPlanPro') : t('rPlanEnt')}
              </button>
            ))}
          </div>
        </div>

        {preview?.dryRun && (
          <div className="subbox">
            <div className="kv"><span className="k">{t('bcAudience')}</span>
              <span className="v num">{preview.recipients} {t('bcOwners')}</span></div>
            {preview.unreachable.length > 0 && (
              <div className="kv"><span className="k">{t('bcNoEmail')}</span>
                <span className="v rslug">{preview.unreachable.join(', ')}</span></div>
            )}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>{t('cancel')}</button>
          <button className="btn ghost" disabled={!filled || send.isPending}
            onClick={() => send.mutate(true)}>{t('bcPreview')}</button>
          <button className="btn" disabled={!filled || send.isPending}
            onClick={() => { if (confirm(t('bcConfirm'))) send.mutate(false); }}>
            {send.isPending ? '…' : t('bcSendGo')}
          </button>
        </div>
      </div>
    </div>
  );
}
