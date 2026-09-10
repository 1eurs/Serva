import { useEffect, useRef } from 'react';
import { Money } from '../../../lib/Money';
import { useI18n } from '../../../lib/i18n';
import type { BaseUnit, CoverRow, Lang, MovementRow, StockItemRow } from '../../../lib/types';
import { LINE_AT, axisPct, dayWord, fill, levelOf, qty, unitTag } from './units';

type T = (k: string) => string;

/* ================================================================== the gauge */

/**
 * One item, drawn against the order line.
 *
 * <p>This is the page's whole argument in one object. An item is not a number, it is a
 * position: left of the line means buy more, right of it means don't. The track is scaled in
 * multiples of that item's own line (see {@link axisPct}), which is what lets forty rows of
 * wildly different quantities share a single vertical rule down the list — so "what needs
 * buying" is something you see before you read a word.
 *
 * <p>{@code rule} draws the notch on the bar itself. The shelf turns it off and draws one
 * continuous rule down the whole list instead; anywhere a gauge stands alone it keeps its own.
 */
export function Gauge({ item, rule = true, className = '' }: {
  item: StockItemRow; rule?: boolean; className?: string;
}) {
  const state = levelOf(item);
  const pct = axisPct(item.onHand, item.reorderPoint);
  if (pct == null) {
    /* No line means no honest place to put a fill. An empty dashed track says "nobody has
       said what this shelf should hold" in the same shape as every other row, rather than
       drawing a bar off a number that was never given. */
    return <div className={`stk-gauge blank ${className}`} aria-hidden />;
  }
  return (
    <div className={`stk-gauge ${className}`} data-state={state} aria-hidden>
      <div className="stk-gauge-fill" style={{ inlineSize: `${pct}%` }} />
      {rule && <i className="stk-gauge-rule" style={{ insetInlineStart: `${LINE_AT}%` }} />}
    </div>
  );
}

/**
 * The words beside the gauge.
 *
 * <p>Days of cover wins wherever we have it, because days are the decision: "2 days" settles
 * whether to phone the supplier and "820 g" does not.
 */
export function stateLabel(item: StockItemRow, c: CoverRow | undefined, t: T, lang: Lang):
{ text: string; tone: ReturnType<typeof levelOf> } {
  const state = levelOf(item);
  if (state === 'out') return { text: t('stOut'), tone: 'out' };
  if (state === 'order') return { text: t('stOrder'), tone: 'order' };
  if (state === 'new') return { text: t('stNew'), tone: 'new' };
  if (c?.daysLeft != null) {
    const n = Math.round(c.daysLeft);
    return { text: fill(t('stDays'), { n, d: dayWord(n, lang) }), tone: 'ok' };
  }
  /* Moving, but not enough trading behind it to name a day. Saying "fine" here would be the
     page vouching for a runway it has not got. */
  if (c) return { text: t('stLearning'), tone: 'new' };
  /* Nobody has said when to buy more, so the tile has no line to fill to and stands empty.
     Naming that is the difference between a blank tile and a broken-looking one. */
  if (item.reorderPoint == null) return { text: t('stNoLine'), tone: 'new' };
  return { text: '', tone: 'ok' };
}

/** A sentence with a price in it, kept bidi-safe so an Arabic line does not scatter. */
export const withMoney = (template: string, value: number) => {
  const [before, after = ''] = template.split('{v}');
  return <>{before}<Money value={value} />{after}</>;
};

/* ================================================================== the rail */

/**
 * A sideways row of chips.
 *
 * <p>The wheel handler is the whole reason this is a component rather than a div. A
 * horizontal scroller is invisible to a plain mouse: the scrollbar is hidden on purpose, and
 * a vertical wheel over a scrollport that only overflows sideways moves nothing at all and
 * does not chain anywhere either — the notch is simply swallowed. Fingers and trackpads
 * already reach these chips; on a back-office laptop the shelf's only control surface
 * stopped at whatever happened to fit.
 *
 * <p>The wheel is claimed only when it actually moved something, so a rail already at its
 * end hands the scroll back to the page instead of trapping it — and the browser, not us,
 * decides where the ends are.
 *
 * <p>The sign is the Arabic case. scrollLeft is physical: an RTL rail starts at 0 with its
 * first chip on the right and counts DOWN into the negatives as you move forward through
 * the list. Adding a positive delta there clamps at zero and the rail sits still, which is
 * the same dead wheel this handler exists to fix.
 */
export function Rail({ className = '', children, ...rest }:
React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      // A real sideways gesture is already going to the right axis; leave it alone.
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const forward = getComputedStyle(el).direction === 'rtl' ? -e.deltaY : e.deltaY;
      const before = el.scrollLeft;
      el.scrollLeft += forward;
      if (el.scrollLeft !== before) e.preventDefault();
    };
    // Not passive: claiming the notch is the point, and React's own onWheel cannot.
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  return <div ref={ref} className={`stk-rail ${className}`.trim()} {...rest}>{children}</div>;
}

/* ================================================================== sheets */

/**
 * The one modal on the feature. Everything that is not the shelf opens in one of these, so
 * a person only ever learns one way in and one way out.
 */
export function Sheet({ title, onClose, children, onSubmit, submitLabel, busy, problem, wide }: {
  title: string; onClose: () => void; children: React.ReactNode;
  onSubmit?: () => void; submitLabel?: string; busy?: boolean;
  /** Why the sheet cannot be submitted yet, said next to the button that is off. */
  problem?: string | null;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="modal-bg stk-modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal-card stk-sheet stock-page${wide ? ' wide' : ''}`}
        role="dialog" aria-modal="true" aria-label={title}>
        <div className="stk-sheet-hd">
          <h3>{title}</h3>
          <button className="x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="stk-sheet-body">{children}</div>
        {onSubmit && (
          <div className="stk-sheet-ft">
            {problem && <p className="stk-sheet-why" role="status">{problem}</p>}
            <button className="btn ghost" onClick={onClose}>✕</button>
            <button className="btn" onClick={onSubmit} disabled={busy || !!problem}>
              {submitLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================== history */

/**
 * When something happened, said the way somebody reading a ledger needs it.
 *
 * <p>A bare clock time made a delivery logged last Tuesday and one logged an hour ago
 * indistinguishable — fatal on the one screen an owner opens to work out why a number is
 * what it is. Today and yesterday get named rather than dated, because that is how the two
 * most-read rows are actually spoken about.
 */
export function movedAt(iso: string, t: T, lang: Lang): string {
  const at = new Date(iso);
  // bidi-ok: locale follows the UI language, so the Arabic page gets Arabic-native time.
  const clock = at.toLocaleTimeString(lang === 'ar' ? 'ar-OM' : 'en-GB',
    { hour: '2-digit', minute: '2-digit' });
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(new Date()) - midnight(at)) / 86_400_000);
  if (days === 0) return `${t('today')} ${clock}`;
  if (days === 1) return `${t('yesterday')} ${clock}`;
  // bidi-ok: same locale-native date as above.
  return `${at.toLocaleDateString(lang === 'ar' ? 'ar-OM' : 'en-GB',
    { day: 'numeric', month: 'short' })} ${clock}`;
}

export function MoveLine({ m, t, unit, name }: {
  m: MovementRow; t: T; unit?: BaseUnit | null; name?: string;
}) {
  const { lang } = useI18n();
  const u = unit ?? m.baseUnit;
  const down = m.deltaBase < 0;
  return (
    <div className="stk-move">
      <span className="stk-move-what">
        <span className="stk-move-tag" data-r={m.reason}>{t(m.reason)}</span>
        {name ?? (m.wasteReason ? t(m.wasteReason) : m.note || '')}
      </span>
      <span className="stk-move-when">
        {movedAt(m.createdAt, t, lang)}
        {name && m.wasteReason ? ` · ${t(m.wasteReason)}` : ''}
      </span>
      <span className={`stk-move-delta num${down ? ' down' : ''}`}>
        <b>{m.deltaBase > 0 ? '+' : ''}{qty(m.deltaBase, u)}</b>
        <small>→ {qty(m.balanceAfter, u)} {unitTag(u, t)}</small>
      </span>
    </div>
  );
}

/**
 * How long ago, in the roughness a person actually speaks in.
 *
 * <p>Used for "Counted 2 hours ago", which is the sentence the whole page's credibility
 * rests on. Precision past "hours" would be false comfort: nobody counts a shelf to the
 * minute, and an owner reading "3 days ago" already knows what to do about it.
 */
export function agoWords(iso: string | null | undefined, t: T, lang: Lang): string | null {
  if (!iso) return null;
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) {
    return lang === 'ar'
      ? (mins < 5 ? 'قبل شوي' : `قبل ${mins} دقيقة`)
      : (mins < 5 ? 'just now' : `${mins} min ago`);
  }
  const hrs = Math.round(mins / 60);
  if (hrs < 24) {
    return lang === 'ar'
      ? (hrs === 1 ? 'قبل ساعة' : hrs === 2 ? 'قبل ساعتين' : `قبل ${hrs} ساعات`)
      : `${hrs} ${hrs === 1 ? 'hour' : 'hours'} ago`;
  }
  const days = Math.round(hrs / 24);
  if (days === 1) return lang === 'ar' ? 'أمس' : 'yesterday';
  return lang === 'ar'
    ? `قبل ${days} ${dayWord(days, lang)}`
    : `${days} ${dayWord(days, lang)} ago`;
}
