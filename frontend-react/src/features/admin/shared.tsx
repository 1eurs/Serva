// Small pieces every console view shares: the colour a status wears, how long ago something
// happened, and the tiles across the top of a page.
import type { ReactNode } from 'react';
import type { AdminRestaurantStats, Plan, SubscriptionStatus } from '../../lib/types';

export const SUB_CLASS = (s?: SubscriptionStatus | null) =>
  s === 'ACTIVE' ? 'ok' : s === 'TRIAL' ? 'warn' : s === 'PAST_DUE' || s === 'EXPIRED' ? 'bad' : '';

/** A stable colour per café, so the same café is the same colour on every screen. */
export const hue = (id: number) => `hsl(${(id * 67) % 360} 70% 60%)`;

/** Compact "how long ago", in the reader's own language. */
export const ago = (iso: string | null | undefined, t: (k: string) => string) => {
  if (!iso) return t('never');
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return t('justNow');
  if (mins < 60) return `${mins}${t('minAgo')}`;
  if (mins < 1440) return `${Math.floor(mins / 60)}${t('hrAgo')}`;
  return `${Math.floor(mins / 1440)}${t('dayAgo')}`;
};

/** Days since an instant — the churn radar's unit. Infinity when it never happened. */
export const daysSince = (iso: string | null | undefined) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : Infinity;

/** Green while a café is ordering today, amber this week, red beyond it. */
export const pulseClass = (iso: string | null | undefined) => {
  const days = daysSince(iso);
  if (days === Infinity) return '';
  if (days < 1) return 'ok';
  if (days < 7) return 'warn';
  return 'bad';
};

export const Kpi = ({ color, label, val, hint }: {
  color: string; label: string; val: ReactNode; hint?: ReactNode;
}) => (
  <div className="kpi">
    <div className="lab"><span className="ic" style={{ background: color }} />{label}</div>
    <div className="val">{val}</div>
    {hint != null && <div className="khint">{hint}</div>}
  </div>
);

/** Percentage change week over week; null when there is no previous week to compare against. */
export const weekDelta = (s?: AdminRestaurantStats) => {
  if (!s || s.ordersPrev7d === 0) return null;
  return Math.round(((s.orders7d - s.ordersPrev7d) / s.ordersPrev7d) * 100);
};

/**
 * The activation checklist for one café. A café is not live because a row exists in the
 * database — it is live when somebody can actually scan a code and order something.
 */
export interface ActivationStep { key: string; done: boolean; count: number }

export const activation = (s?: AdminRestaurantStats): ActivationStep[] => [
  { key: 'actOwner', done: (s?.owners ?? 0) > 0, count: s?.owners ?? 0 },
  { key: 'actBranch', done: (s?.branches ?? 0) > 0, count: s?.branches ?? 0 },
  { key: 'actMenu', done: (s?.menuItems ?? 0) > 0, count: s?.menuItems ?? 0 },
  { key: 'actTables', done: (s?.tables ?? 0) > 0, count: s?.tables ?? 0 },
  { key: 'actOrder', done: (s?.ordersTotal ?? 0) > 0, count: s?.ordersTotal ?? 0 },
];

export const planLabelKey = (p?: Plan | null) =>
  p === 'STANDARD' ? 'rPlanStd' : p === 'ENTERPRISE' ? 'rPlanEnt' : 'rPlanPro';

/** Local YYYY-MM-DD, for date inputs that must not drift a day via toISOString(). */
export const isoDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
