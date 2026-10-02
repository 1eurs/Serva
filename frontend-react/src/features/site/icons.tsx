import type { ReactNode } from 'react';

/* Line icons for the marketing pages, drawn on a 24px grid with a 1.7 stroke so they
   sit at the weight of Plex Sans. Decorative only: every icon appears beside a word
   that says the same thing, so they are hidden from assistive tech. */

const PATHS = {
  cafe: <><path d="M4 9h12v4.5A5.5 5.5 0 0 1 10.5 19h-1A5.5 5.5 0 0 1 4 13.5V9Z" /><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16" /><path d="M8 3.5v2.5M12 3.5v2.5" /></>,
  restaurant: <><path d="M3 18h18" /><path d="M5 18a7 7 0 0 1 14 0" /><path d="M12 8.5V6.5M10 6.5h4" /></>,
  truck: <><path d="M2.5 6.5h11v9.5h-11z" /><path d="M13.5 9.5h4l3 3.5v3h-7" /><circle cx="6.5" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>,
  juice: <><path d="M6 8h12l-1.6 12.5H7.6L6 8Z" /><path d="M5 8h14" /><path d="M13.5 8l1.5-5h3" /></>,
  pos: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M12 16v4M8 20h8" /><path d="M7 8h4M7 11h7" /></>,
  qr: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2.5v2.5H14zM18.5 14H20M14 19.5h2M18.5 18.5V20H20" /></>,
  car: <><path d="M3.5 13.5l1.8-5A2 2 0 0 1 7.2 7h9.6a2 2 0 0 1 1.9 1.5l1.8 5V17h-17v-3.5Z" /><path d="M3.5 13.5h17" /><circle cx="7.5" cy="17" r="1.8" /><circle cx="16.5" cy="17" r="1.8" /></>,
  pager: <><rect x="7" y="3" width="10" height="18" rx="2.5" /><path d="M10 12l1.6 1.6L14.5 10.5" /></>,
  printer: <><path d="M7 8V3.5h10V8" /><path d="M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M7 13h10v7.5H7z" /></>,
  board: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16" /></>,
  table: <><path d="M3.5 9.5h17" /><path d="M6 9.5v9M18 9.5v9" /><path d="M9 5.5h6" /></>,
  chart: <><path d="M4 20h16" /><path d="M7 20v-7M12 20V6M17 20v-10" /></>,
  cash: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6.5 9.5v.01M17.5 14.5v.01" /></>,
  box: <><path d="M4 8l8-4 8 4v8.5l-8 4-8-4V8Z" /><path d="M4 8l8 4 8-4M12 12v8.5" /></>,
  heart: <path d="M12 19.5s-7-4.4-7-9.7A4 4 0 0 1 12 7.3a4 4 0 0 1 7 2.5c0 5.3-7 9.7-7 9.7Z" />,
  palette: <><path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.2-1-1.6-1-2.6 0-.9.8-1.6 1.7-1.6h2a4 4 0 0 0 4-4c0-3.9-3.8-7.1-8.5-7.1Z" /><circle cx="7.8" cy="11" r="1" /><circle cx="10.5" cy="7.5" r="1" /><circle cx="15" cy="8" r="1" /></>,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.3 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.3-3.5-8.5S9.6 5.9 12 3.5Z" /></>,
  users: <><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" /><circle cx="17" cy="9.5" r="2.3" /><path d="M15.5 14.3a4.6 4.6 0 0 1 5 4.7" /></>,
  pin: <><path d="M12 20.5s-6-5.3-6-10.5a6 6 0 0 1 12 0c0 5.2-6 10.5-6 10.5Z" /><circle cx="12" cy="10" r="2" /></>,
  chat: <><path d="M4 18.5V7a2.5 2.5 0 0 1 2.5-2.5h11A2.5 2.5 0 0 1 20 7v7a2.5 2.5 0 0 1-2.5 2.5H8L4 18.5Z" /><path d="M8.5 9.5h7M8.5 12.5h4.5" /></>,
  wrench: <><path d="M14.5 5.5a4 4 0 0 0 4.9 4.9l-8.9 8.9a2 2 0 0 1-2.8-2.8l8.9-8.9a4 4 0 0 1-2.1-2.1Z" /></>,
  rocket: <><path d="M12 15.5 8.5 12c1.6-4.6 4.9-7.6 10-8.5-.9 5.1-3.9 8.4-8.5 10Z" /><path d="M8.5 12 5 11.5 7.5 9h3M12 15.5l.5 3.5 2.5-2.5v-3" /><path d="M6 18c-1 .6-1.5 1.4-1.5 1.5s1-.5 1.5-.5" /></>,
  grow: <><path d="M4 18l5.5-5.5 3.5 3.5L20 9" /><path d="M15 9h5v5" /></>,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {PATHS[name]}
    </svg>
  );
}
