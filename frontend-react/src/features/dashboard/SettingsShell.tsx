import { useMemo, type ReactNode } from 'react';
import { create as createQrMatrix } from 'qrcode/lib/core/qrcode.js';

/**
 * The shell every Settings pane wears.
 *
 * Loyalty set the pattern and the rest of Settings now follows it: a hero band
 * carrying a physical mark, the surface the pane's settings land on, a display
 * title and the pane's single primary action — then a two-column body whose
 * aside holds a live specimen of whatever the pane produces (a table card, a
 * strip of thermal tape, a receipt, the chrome itself).
 *
 * Structure lives in settings.css under `.stg-*`. Section internals stay on the
 * `.profile-*` / `.field` / `.switch` primitives from dashboard.css.
 */
export function SettingsShell({ mark, markClass, markStyle, bareMark, surface, title, sub, actions, aside, asideWidth, children }: {
  mark: ReactNode;
  /** `type` renders the mark as a type specimen, `seal` as a stamped paper tile. */
  markClass?: 'type' | 'seal';
  markStyle?: React.CSSProperties;
  /** Drop the tile and let `mark` stand on its own (the Café pane's real logo). */
  bareMark?: boolean;
  /** Where these settings show up, e.g. "Customer menu". Kept short and literal. */
  surface: string;
  title: string;
  sub: string;
  actions?: ReactNode;
  aside?: ReactNode;
  /** `paper` widens the aside to fit an 80mm receipt sheet. */
  asideWidth?: 'paper';
  children: ReactNode;
}) {
  return (
    <div className="stg-pane">
      <header className="stg-hero">
        <div className="stg-hero-id">
          {bareMark
            ? mark
            : <div className={'stg-mark' + (markClass ? ' ' + markClass : '')} style={markStyle} aria-hidden="true">{mark}</div>}
          <div className="stg-hero-copy">
            <div className="stg-surface"><span />{surface}</div>
            <h3>{title}</h3>
            <p>{sub}</p>
          </div>
        </div>
        {actions && <div className="stg-hero-actions">{actions}</div>}
      </header>

      <div className={'stg-layout' + (aside ? (asideWidth === 'paper' ? ' paper' : '') : ' solo')}>
        <main className="stg-main">{children}</main>
        {aside && <aside className="stg-aside">{aside}</aside>}
      </div>
    </div>
  );
}

/** A numbered config section. Numbering restarts inside each pane, so a step
 *  number always counts something the reader can see on screen. */
export function PaneSection({ no, title, sub, children }: {
  no: string; title: string; sub: string; children: ReactNode;
}) {
  return (
    <section className="profile-section">
      <div className="profile-section-head">
        <span className="profile-section-no">{no}</span>
        <div><h4>{title}</h4><p>{sub}</p></div>
      </div>
      {children}
    </section>
  );
}

/** The aside card that frames a specimen. */
export function Specimen({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="stg-spec">
      <span className="stg-spec-label">{label}</span>
      {children}
    </section>
  );
}

/**
 * Crisp QR matrix, encoder only — the package main entry pulls in fs/canvas, so
 * we render the module grid ourselves (same subpath the Tables tab uses).
 */
export function MiniQr({ value, className = 'stg-qr' }: { value: string; className?: string }) {
  const { d, n } = useMemo(() => {
    const { modules } = createQrMatrix(value, { errorCorrectionLevel: 'M' });
    const size = modules.size;
    let path = '';
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) if (modules.get(r, c)) path += `M${c} ${r}h1v1h-1z`;
    }
    return { d: path, n: size };
  }, [value]);
  return (
    <svg className={className} viewBox={`-1 -1 ${n + 2} ${n + 2}`} shapeRendering="crispEdges" role="img" aria-label={value}>
      <rect x={-1} y={-1} width={n + 2} height={n + 2} fill="#fff" />
      <path d={d} fill="#15181C" />
    </svg>
  );
}
