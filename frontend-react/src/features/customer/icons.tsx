/**
 * The menu's icons.
 *
 * These were emoji. Emoji are the wrong tool here for three reasons: every one arrives in
 * its own fixed colours, so they fight whichever palette the café picked; they are drawn
 * differently on every phone, so the menu is never quite the design anyone approved; and a
 * cartoon clock beside a hand-set Arabic heading is the single loudest thing on the page.
 *
 * Each icon below is a 16px line drawing on a 24 viewBox, stroked in `currentColor` — so it
 * takes the ink of whatever chip it sits in, in all sixteen themes, with no per-theme rules.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false" {...rest}
    >
      {children}
    </svg>
  );
}

export const IconClock = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 1.8" /></Svg>
);

export const IconPin = (p: IconProps) => (
  <Svg {...p}><path d="M12 21s6.5-5.4 6.5-10a6.5 6.5 0 1 0-13 0c0 4.6 6.5 10 6.5 10Z" /><circle cx="12" cy="11" r="2.4" /></Svg>
);

export const IconPhone = (p: IconProps) => (
  <Svg {...p}><path d="M7.6 3.8h-2A1.8 1.8 0 0 0 3.8 5.7 15.5 15.5 0 0 0 18.3 20.2a1.8 1.8 0 0 0 1.9-1.8v-2a1.4 1.4 0 0 0-1.2-1.4l-2.3-.4a1.4 1.4 0 0 0-1.4.6l-.7 1a12 12 0 0 1-5.3-5.3l1-.7a1.4 1.4 0 0 0 .6-1.4L10.5 5a1.4 1.4 0 0 0-1.4-1.2Z" /></Svg>
);

export const IconInstagram = (p: IconProps) => (
  <Svg {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="3.8" /><path d="M17 7h.01" /></Svg>
);

/** Prep time. A stopwatch reads as "how long", where a clock reads as "what time". */
export const IconTimer = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="13.5" r="7" /><path d="M12 10v3.5l2.2 1.3" /><path d="M9.5 3h5" /><path d="M12 3v3.5" /></Svg>
);

export const IconTicket = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 8.5A1 1 0 0 1 4.5 7.5h15a1 1 0 0 1 1 1v2a2 2 0 0 0 0 3.9v2a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-2a2 2 0 0 0 0-3.9Z" />
    <path d="M14 8.6v1.2" /><path d="M14 14.2v1.2" />
  </Svg>
);

export const IconGift = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.6" y="10.5" width="16.8" height="9.5" rx="1.4" /><path d="M2.8 7.4h18.4v3.1H2.8z" /><path d="M12 7.4V20" />
    <path d="M12 7.4S10.9 4 9 4a2 2 0 0 0 0 3.4Z" /><path d="M12 7.4S13.1 4 15 4a2 2 0 0 1 0 3.4Z" />
  </Svg>
);

export const IconCart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 4.5h1.9l2.2 10.2a1.6 1.6 0 0 0 1.6 1.3h8a1.6 1.6 0 0 0 1.6-1.2l1.6-6.4H5.6" />
    <circle cx="9.5" cy="20" r="1.3" /><circle cx="17" cy="20" r="1.3" />
  </Svg>
);

/** The house-card chips are built as data in menuInfo.ts; this maps a key to its drawing. */
export const FACT_ICONS = {
  hours: IconClock,
  area: IconPin,
  phone: IconPhone,
  instagram: IconInstagram,
} as const;

export type FactIconKey = keyof typeof FACT_ICONS;
