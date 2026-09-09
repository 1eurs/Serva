import { useEffect, useId, useMemo, useState } from 'react';
import { create as createQrMatrix } from 'qrcode/lib/core/qrcode.js';
import { BRAND } from '../../lib/brand';
import { BOLD_FONTS } from '../../lib/fonts';
import { FONT_STACKS, type MenuFontKey } from '../customer/menuThemes';

/**
 * The QR badge look — types, palette, persistence and the renderer.
 *
 * Pulled out of DashboardApp when the studio moved to Settings. Two screens now
 * read this: the studio in Settings, which writes the style, and Tables, which
 * only draws with it. Keeping the renderer next to the vocabulary it renders
 * means a new dot shape is one file, not three.
 */

/* Bold-style QR: we render the matrix ourselves as inline SVG so the pattern
   matches the landing poster — ink "dot" modules, rounded finder eyes — and the
   center badge is real inline <text> (an embedded <image> logo uses a separate
   square chip). Error correction stays at H so the rounded modules + cleared
   badge area still scan. No logo → café name in the same neobrutalist pill. */
const fmt = (v: number) => Math.round(v * 100) / 100;
const roundRectPath = (x: number, y: number, w: number, h: number, r: number) => {
  const rad = Math.min(r, w / 2, h / 2);
  return `M${fmt(x + rad)} ${fmt(y)}h${fmt(w - 2 * rad)}a${fmt(rad)} ${fmt(rad)} 0 0 1 ${fmt(rad)} ${fmt(rad)}`
    + `v${fmt(h - 2 * rad)}a${fmt(rad)} ${fmt(rad)} 0 0 1 ${fmt(-rad)} ${fmt(rad)}`
    + `h${fmt(-(w - 2 * rad))}a${fmt(rad)} ${fmt(rad)} 0 0 1 ${fmt(-rad)} ${fmt(-rad)}`
    + `v${fmt(-(h - 2 * rad))}a${fmt(rad)} ${fmt(rad)} 0 0 1 ${fmt(rad)} ${fmt(-rad)}z`;
};

// Hardcoded hex (not CSS vars) so print portal SVG stays correct without app stylesheets.
export const QR_INK = '#15181C';
export const QR_ACCENT = '#10b981';

/** Fonts for the text badge. */
export type QrFontId = 'bricolage' | Extract<MenuFontKey, 'tajawal' | 'markazi' | 'elmessiri' | 'reemkufi' | 'sora'>;
export const QR_FONT_STACK: Record<QrFontId, string> = {
  bricolage: "'Bricolage Grotesque','IBM Plex Sans Arabic',system-ui,sans-serif",
  tajawal: FONT_STACKS.tajawal,
  markazi: FONT_STACKS.markazi,
  elmessiri: FONT_STACKS.elmessiri,
  reemkufi: FONT_STACKS.reemkufi,
  sora: FONT_STACKS.sora,
};
export const QR_FONT_IDS = Object.keys(QR_FONT_STACK) as QrFontId[];
export const QR_FONT_GOOGLE: Partial<Record<QrFontId, string[]>> = {
  bricolage: BOLD_FONTS,
  tajawal: ['Tajawal:wght@400;500;700;800'],
  markazi: ['Markazi+Text:wght@400;500;600;700'],
  elmessiri: ['El+Messiri:wght@500;600;700'],
  reemkufi: ['Reem+Kufi:wght@500;600;700'],
  sora: ['Sora:wght@600;700;800'],
};

export type QrDotStyle = 'soft' | 'square' | 'dots' | 'diamond';
export type QrEyeStyle = 'square' | 'rounded' | 'circle';
export type QrBadgeShape = 'brutal' | 'flat' | 'pill' | 'round';
export const QR_DOT_IDS: QrDotStyle[] = ['soft', 'square', 'dots', 'diamond'];
export const QR_EYE_IDS: QrEyeStyle[] = ['square', 'rounded', 'circle'];
export const QR_BADGE_SHAPE_IDS: QrBadgeShape[] = ['brutal', 'flat', 'pill', 'round'];

/** Shared palette for ink + badge. Paper is always pure white (scan reliability). */
export const QR_PALETTE: { id: string; fill: string }[] = [
  { id: 'lime', fill: QR_ACCENT },
  { id: 'ink', fill: QR_INK },
  { id: 'black', fill: '#0A0A0A' },
  { id: 'navy', fill: '#1B2A4A' },
  { id: 'espresso', fill: '#3D2314' },
  { id: 'burgundy', fill: '#6B1D3A' },
  { id: 'forest', fill: '#1F4D3A' },
  { id: 'coral', fill: '#FF6B4A' },
  { id: 'sky', fill: '#5B9FFF' },
  { id: 'violet', fill: '#7C5CFC' },
  { id: 'gold', fill: '#E8B84A' },
  { id: 'cream', fill: '#F5E6C8' },
  { id: 'blush', fill: '#FFD6E0' },
  { id: 'mint', fill: '#C8F5E4' },
  { id: 'white', fill: '#FFFFFF' },
];
const QR_PALETTE_MAP = Object.fromEntries(QR_PALETTE.map((c) => [c.id, c.fill])) as Record<string, string>;
/** Inks dark enough to scan on white paper. */
export const QR_INK_IDS = ['ink', 'black', 'navy', 'espresso', 'burgundy', 'forest', 'violet'] as const;
const QR_BADGE_COLOR_IDS = QR_PALETTE.map((c) => c.id);
const QR_PAPER = '#ffffff';

/** Where the center image comes from. Absent (older saved styles) reads as 'custom'. */
export type QrBadgeSource = 'cafe' | 'custom';

/**
 * Per-café QR style blob (localStorage now → restaurant field when paid).
 * Paper is fixed white (not stored / not customizable).
 *
 * The center image is stored as a source plus a URL rather than a URL alone. A café that
 * picks its own logo means "use my logo", not "use the file that was at this address in
 * March" — so `cafe` is resolved against the live profile at draw time and a re-uploaded
 * logo re-brands the codes by itself. `custom` is a QR-only image and never touches
 * restaurant.logoUrl in either direction.
 */
export type QrBadgeStyle = {
  colorId: string;
  inkId: string;
  fontId: QrFontId;
  dotStyle: QrDotStyle;
  eyeStyle: QrEyeStyle;
  badgeShape: QrBadgeShape;
  badgeSource?: QrBadgeSource | null;
  badgeImageUrl?: string | null;
};
export const DEFAULT_QR_STYLE: QrBadgeStyle = {
  colorId: 'lime', inkId: 'ink',
  fontId: 'bricolage', dotStyle: 'soft', eyeStyle: 'square', badgeShape: 'brutal',
  badgeSource: null,
  badgeImageUrl: null,
};

type QrPreset = { id: string; style: Partial<QrBadgeStyle>; swatch: [string, string, string] };
export const QR_PRESETS: QrPreset[] = [
  { id: 'serva', style: { ...DEFAULT_QR_STYLE }, swatch: [QR_INK, QR_ACCENT, '#fff'] },
  { id: 'espresso', style: { inkId: 'espresso', colorId: 'gold', fontId: 'markazi', dotStyle: 'soft', eyeStyle: 'rounded', badgeShape: 'pill' }, swatch: ['#3D2314', '#E8B84A', '#fff'] },
  { id: 'ocean', style: { inkId: 'navy', colorId: 'sky', fontId: 'sora', dotStyle: 'dots', eyeStyle: 'circle', badgeShape: 'round' }, swatch: ['#1B2A4A', '#5B9FFF', '#fff'] },
  { id: 'sunset', style: { inkId: 'burgundy', colorId: 'coral', fontId: 'elmessiri', dotStyle: 'diamond', eyeStyle: 'rounded', badgeShape: 'brutal' }, swatch: ['#6B1D3A', '#FF6B4A', '#fff'] },
  { id: 'mono', style: { inkId: 'black', colorId: 'white', fontId: 'bricolage', dotStyle: 'square', eyeStyle: 'square', badgeShape: 'flat' }, swatch: ['#0A0A0A', '#fff', '#eee'] },
  { id: 'candy', style: { inkId: 'violet', colorId: 'violet', fontId: 'reemkufi', dotStyle: 'dots', eyeStyle: 'circle', badgeShape: 'pill' }, swatch: ['#7C5CFC', '#C8F5E4', '#fff'] },
];

/**
 * Hand-tuned combos for "Quick mix": pick a designed ink/badge pair, then randomize
 * shapes/font. Paper is always white. Unlike the menu look — where randomising fields the
 * owner could not see was the whole problem — a QR code has one job and no hidden state:
 * every field this touches has a control right next to the button.
 */
type QrMixRecipe = Pick<QrBadgeStyle, 'inkId' | 'colorId'>;
const QR_MIX_RECIPES: QrMixRecipe[] = [
  { inkId: 'ink', colorId: 'lime' },
  { inkId: 'espresso', colorId: 'gold' },
  { inkId: 'espresso', colorId: 'coral' },
  { inkId: 'navy', colorId: 'sky' },
  { inkId: 'navy', colorId: 'lime' },
  { inkId: 'burgundy', colorId: 'coral' },
  { inkId: 'burgundy', colorId: 'gold' },
  { inkId: 'forest', colorId: 'lime' },
  { inkId: 'forest', colorId: 'gold' },
  { inkId: 'violet', colorId: 'violet' },
  { inkId: 'violet', colorId: 'coral' },
  { inkId: 'black', colorId: 'white' },
  { inkId: 'black', colorId: 'ink' },
  { inkId: 'ink', colorId: 'coral' },
  { inkId: 'navy', colorId: 'cream' },
  { inkId: 'espresso', colorId: 'cream' },
];

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

/** Fresh random look from curated recipes — keeps logo, avoids repeating the last palette. */
export function randomQrStyle(current: QrBadgeStyle): QrBadgeStyle {
  const pool = QR_MIX_RECIPES.filter(
    (r) => !(r.inkId === current.inkId && r.colorId === current.colorId),
  );
  const recipe = pick(pool.length ? pool : QR_MIX_RECIPES);
  return {
    ...DEFAULT_QR_STYLE,
    ...recipe,
    fontId: pick(QR_FONT_IDS),
    dotStyle: pick(QR_DOT_IDS),
    eyeStyle: pick(QR_EYE_IDS),
    badgeShape: pick(QR_BADGE_SHAPE_IDS),
    // Logo is intentional branding — don't wipe it on shuffle (same as presets).
    badgeSource: current.badgeSource ?? null,
    badgeImageUrl: current.badgeImageUrl ?? null,
  };
}

export function loadQrStyle(restaurantId?: number | null): QrBadgeStyle {
  if (!restaurantId) return { ...DEFAULT_QR_STYLE };
  try {
    const raw = localStorage.getItem(`serva.qrBadge.${restaurantId}`);
    if (!raw) return { ...DEFAULT_QR_STYLE };
    const p = JSON.parse(raw) as Partial<QrBadgeStyle>;
    return {
      colorId: QR_BADGE_COLOR_IDS.includes(p.colorId!) ? p.colorId! : DEFAULT_QR_STYLE.colorId,
      inkId: (QR_INK_IDS as readonly string[]).includes(p.inkId!) ? p.inkId! : DEFAULT_QR_STYLE.inkId,
      fontId: QR_FONT_IDS.includes(p.fontId as QrFontId) ? (p.fontId as QrFontId) : DEFAULT_QR_STYLE.fontId,
      dotStyle: QR_DOT_IDS.includes(p.dotStyle as QrDotStyle) ? (p.dotStyle as QrDotStyle) : DEFAULT_QR_STYLE.dotStyle,
      eyeStyle: QR_EYE_IDS.includes(p.eyeStyle as QrEyeStyle) ? (p.eyeStyle as QrEyeStyle) : DEFAULT_QR_STYLE.eyeStyle,
      badgeShape: QR_BADGE_SHAPE_IDS.includes(p.badgeShape as QrBadgeShape) ? (p.badgeShape as QrBadgeShape) : DEFAULT_QR_STYLE.badgeShape,
      badgeSource: p.badgeSource === 'cafe' || p.badgeSource === 'custom' ? p.badgeSource : null,
      badgeImageUrl: typeof p.badgeImageUrl === 'string' && p.badgeImageUrl.trim() ? p.badgeImageUrl.trim() : null,
    };
  } catch {
    return { ...DEFAULT_QR_STYLE };
  }
}
export function saveQrStyle(restaurantId: number | null | undefined, style: QrBadgeStyle) {
  if (!restaurantId) return;
  try { localStorage.setItem(`serva.qrBadge.${restaurantId}`, JSON.stringify(style)); } catch { /* ignore */ }
}

/** The source a stored style is really asking for. Styles saved before the source existed
 *  carry a URL and nothing else, which meant 'custom'. */
export function qrBadgeSourceOf(style: QrBadgeStyle): QrBadgeSource | null {
  return style.badgeSource ?? (style.badgeImageUrl ? 'custom' : null);
}

/**
 * The style as it should actually be drawn.
 *
 * The source decides, not the URL: `cafe` draws whatever is on the profile right now (so a
 * café that re-uploads its logo does not have to come back here), `custom` draws the stored
 * upload, and no source draws the name badge. Because the URL is only consulted for
 * `custom`, the last upload can stay on the style while another source is active — switching
 * to the café logo and back does not ask for the same file twice. A café source with no logo
 * on the profile falls back to the name badge rather than drawing a hole.
 */
export function resolveQrStyle(style: QrBadgeStyle, cafeLogoUrl?: string | null): QrBadgeStyle {
  const src = qrBadgeSourceOf(style);
  const url = src === 'cafe' ? cafeLogoUrl?.trim() || null
    : src === 'custom' ? style.badgeImageUrl?.trim() || null
    : null;
  return url === (style.badgeImageUrl ?? null) ? style : { ...style, badgeImageUrl: url };
}

export function qrHex(id: string, fallback: string): string {
  return QR_PALETTE_MAP[id] ?? fallback;
}

/** Perceived luminance → pick ink vs white text on the badge fill. */
function qrTextOn(fill: string, ink = QR_INK): string {
  const hex = fill.replace('#', '');
  if (hex.length !== 6) return ink;
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  const lum = (r * 299 + g * 587 + b * 114) / 1000;
  return lum < 150 ? '#FFFFFF' : ink;
}

const circlePath = (cx: number, cy: number, r: number) =>
  `M${fmt(cx - r)} ${fmt(cy)}a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(r * 2)} 0a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-r * 2)} 0`;

const diamondPath = (x: number, y: number, w: number, h: number) => {
  const cx = x + w / 2, cy = y + h / 2;
  return `M${fmt(cx)} ${fmt(y)}L${fmt(x + w)} ${fmt(cy)}L${fmt(cx)} ${fmt(y + h)}L${fmt(x)} ${fmt(cy)}Z`;
};

function modulePath(style: QrDotStyle, x: number, y: number, cell: number): string {
  if (style === 'square') return roundRectPath(x, y, cell, cell, 0);
  if (style === 'dots') return circlePath(x + cell / 2, y + cell / 2, cell * 0.46);
  if (style === 'diamond') return diamondPath(x + cell * 0.06, y + cell * 0.06, cell * 0.88, cell * 0.88);
  return roundRectPath(x, y, cell, cell, cell * 0.22);
}

function eyePath(style: QrEyeStyle, x: number, y: number, cell: number): string {
  const s = cell * 7;
  if (style === 'circle') {
    const cx = x + s / 2, cy = y + s / 2;
    // outer ring + white gap + pupil via even-odd
    return `${circlePath(cx, cy, s * 0.5)}${circlePath(cx, cy, s * 0.36)}${circlePath(cx, cy, s * 0.22)}`;
  }
  if (style === 'rounded') {
    const r = cell * 1.1;
    return `${roundRectPath(x, y, s, s, r)}${roundRectPath(x + cell, y + cell, cell * 5, cell * 5, r * 0.7)}${roundRectPath(x + cell * 2, y + cell * 2, cell * 3, cell * 3, r * 0.5)}`;
  }
  // sharp / square
  return `${roundRectPath(x, y, s, s, cell * 0.45)}${roundRectPath(x + cell, y + cell, cell * 5, cell * 5, cell * 0.32)}${roundRectPath(x + cell * 2, y + cell * 2, cell * 3, cell * 3, cell * 0.24)}`;
}

/** Shared canvas for measuring badge text against real font metrics. */
let _qrMeasureCtx: CanvasRenderingContext2D | null = null;
function qrMeasureCtx(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!_qrMeasureCtx) {
    const c = document.createElement('canvas');
    _qrMeasureCtx = c.getContext('2d');
  }
  return _qrMeasureCtx;
}

/**
 * Largest font size that keeps `label` inside the chip. Uses canvas measureText
 * so wide display faces (Reem Kufi, Markazi, etc.) don't blow past the pill.
 * Height is capped hard — bold Arabic fonts have tall vertical metrics at 800.
 */
function fitBadgeFontSize(label: string, fontStack: string, maxW: number, maxH: number): number {
  if (!label) return maxH * 0.4;
  // Display faces at weight 800 routinely overshoot the em box; keep a generous air gap.
  const maxByHeight = maxH * 0.42;
  const minFs = Math.max(5, maxH * 0.22);
  const ctx = qrMeasureCtx();
  if (!ctx) {
    // SSR / no canvas — conservative char-unit fallback.
    let units = 0;
    for (const ch of label) {
      if (/\s|[·.,،]/.test(ch)) units += 0.28;
      else if (ch.charCodeAt(0) > 0x0600) units += 1.05;
      else units += 0.62;
    }
    return Math.max(minFs, Math.min(maxByHeight, maxW / Math.max(units, 1)));
  }
  // Binary search the largest size that still fits maxW.
  let lo = minFs, hi = maxByHeight, best = minFs;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    ctx.font = `800 ${mid}px ${fontStack}`;
    // letter-spacing -0.02em is applied in SVG; approximate here.
    const w = ctx.measureText(label).width * 0.98;
    if (w <= maxW) { best = mid; lo = mid; }
    else hi = mid;
  }
  return best;
}

/** Text-badge envelope — fixed-ish pill so scan area stays predictable. */
function textBadgeSize(size: number, label: string): { bw: number; bh: number } {
  const len = Math.max(1, [...label].length);
  // Wider for longer names, but never more than ~half the QR (ECC-H budget).
  const bw = size * Math.min(0.52, Math.max(0.30, 0.18 + len * 0.024));
  // Slightly taller pill so font has room without looking cramped.
  const bh = size * (len > 12 ? 0.148 : 0.138);
  return { bw, bh };
}

export function BrandedQrCode({ value, size, marginSize = 1, badge = true, style, label }: {
  value: string; size: number; marginSize?: number; badge?: boolean;
  style?: QrBadgeStyle; label?: string | null;
}) {
  const s = style ?? DEFAULT_QR_STYLE;
  const ink = qrHex(s.inkId, QR_INK);
  const paper = QR_PAPER; // always pure white — never customized
  const badgeFill = qrHex(s.colorId, QR_ACCENT);
  const stack = QR_FONT_STACK[s.fontId] ?? QR_FONT_STACK.bricolage;
  const badgeImageUrl = s.badgeImageUrl;
  const clipId = useId();
  const textClipId = `${clipId}-txt`;
  const hasLogo = badge && !!badgeImageUrl;
  const mark = (label && label.trim()) || BRAND.name;
  const textLabel = hasLogo ? '' : mark;
  const { bw: textBw, bh: textBh } = textBadgeSize(size, textLabel || BRAND.name);

  const [fontTick, setFontTick] = useState(0);
  useEffect(() => {
    if (hasLogo || typeof document === 'undefined' || !document.fonts) return;
    let cancelled = false;
    document.fonts.ready.then(() => { if (!cancelled) setFontTick((n) => n + 1); });
    document.fonts.load(`800 16px ${stack}`).then(() => { if (!cancelled) setFontTick((n) => n + 1); }).catch(() => {});
    return () => { cancelled = true; };
  }, [stack, hasLogo, textLabel]);

  const { cells, eyes, cell } = useMemo(() => {
    const { modules } = createQrMatrix(value, { errorCorrectionLevel: 'H' });
    const n = modules.size;
    const dim = n + marginSize * 2;
    const cell = size / dim;
    const off = marginSize * cell;
    const px = (i: number) => off + i * cell;
    const isFinder = (r: number, c: number) =>
      (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
    const bw = badge ? (hasLogo ? size * 0.26 : textBw) : 0;
    const bh = badge ? (hasLogo ? size * 0.26 : textBh) : 0;
    const bx = (size - bw) / 2, by = (size - bh) / 2, bpad = cell * 0.75;
    const inBadge = (cx: number, cy: number) =>
      badge && cx > bx - bpad && cx < bx + bw + bpad && cy > by - bpad && cy < by + bh + bpad;

    let cells = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!modules.get(r, c) || isFinder(r, c)) continue;
        const cx = px(c) + cell / 2, cy = px(r) + cell / 2;
        if (inBadge(cx, cy)) continue;
        cells += modulePath(s.dotStyle, px(c), px(r), cell);
      }
    }
    const eyes = `${eyePath(s.eyeStyle, px(0), px(0), cell)}${eyePath(s.eyeStyle, px(n - 7), px(0), cell)}${eyePath(s.eyeStyle, px(0), px(n - 7), cell)}`;
    return { cells, eyes, cell };
  }, [value, size, marginSize, badge, hasLogo, textBw, textBh, s.dotStyle, s.eyeStyle]);

  const bw = hasLogo ? size * 0.26 : textBw;
  const bh = hasLogo ? size * 0.26 : textBh;
  const bx = (size - bw) / 2, by = (size - bh) / 2;
  const badgeBorder = Math.max(2, size * 0.013);
  const badgeSh = s.badgeShape === 'brutal' ? Math.max(2, size * 0.016) : 0;
  // Shape radius: round ≈ circle (logo), pill = capsule, flat/brutal = tight.
  const badgeR = s.badgeShape === 'round' ? Math.min(bw, bh) / 2
    : s.badgeShape === 'pill' ? Math.min(bw, bh) / 2
    : hasLogo ? bw * 0.18
    : bh * 0.16;
  const logoInset = bw * 0.14;
  const textFill = qrTextOn(badgeFill, ink);
  const textPadX = Math.max(badgeBorder + 2, bw * 0.08);
  const textPadY = Math.max(badgeBorder + 1, bh * 0.12);
  const fontSize = useMemo(
    () => fitBadgeFontSize(textLabel, stack, bw - textPadX * 2, bh - textPadY * 2),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [textLabel, stack, bw, bh, textPadX, textPadY, fontTick],
  );
  const isLatinOnly = /^[\x00-\x7F]*$/.test(textLabel);
  const innerR = Math.max(0, badgeR - badgeBorder);
  // Clear under badge uses paper so the quiet zone matches the QR paper tint.
  const clearPad = cell * 0.9;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" shapeRendering="geometricPrecision">
      <rect width={size} height={size} fill={paper} />
      <path d={cells} fill={ink} />
      <path d={eyes} fill={ink} fillRule="evenodd" />
      {badge && (
        <>
          <path d={roundRectPath(bx - clearPad, by - clearPad, bw + clearPad * 2 + badgeSh, bh + clearPad * 2 + badgeSh, clearPad * 0.5)} fill={paper} />
          {badgeSh > 0 && (
            <path d={roundRectPath(bx + badgeSh, by + badgeSh, bw, bh, badgeR)} fill={ink} />
          )}
          {hasLogo ? (
            <>
              <path d={roundRectPath(bx, by, bw, bh, badgeR)} fill="#ffffff" stroke={ink} strokeWidth={badgeBorder} />
              <clipPath id={clipId}>
                <path d={roundRectPath(bx + badgeBorder, by + badgeBorder, bw - badgeBorder * 2, bh - badgeBorder * 2, innerR)} />
              </clipPath>
              <image href={badgeImageUrl!} x={bx + logoInset} y={by + logoInset} width={bw - logoInset * 2} height={bh - logoInset * 2}
                preserveAspectRatio="xMidYMid meet" clipPath={`url(#${clipId})`} />
            </>
          ) : (
            <>
              <path d={roundRectPath(bx, by, bw, bh, badgeR)} fill={badgeFill} stroke={ink} strokeWidth={badgeBorder} />
              <clipPath id={textClipId}>
                <path d={roundRectPath(bx + badgeBorder, by + badgeBorder, bw - badgeBorder * 2, bh - badgeBorder * 2, innerR)} />
              </clipPath>
              <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
                direction={isLatinOnly ? 'ltr' : 'auto'}
                unicodeBidi={isLatinOnly ? 'bidi-override' : 'normal'}
                fontFamily={stack}
                fontWeight={800} fontSize={fontSize} letterSpacing="-0.02em" fill={textFill}
                clipPath={`url(#${textClipId})`}>
                {isLatinOnly ? `${textLabel}\u200E` : textLabel}
              </text>
            </>
          )}
        </>
      )}
    </svg>
  );
}
