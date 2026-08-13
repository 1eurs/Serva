/* =====================================================================
   Posture — the one place that decides how the app is being held.
------------------------------------------------------------------------
   Serva runs on a café floor, not a desk. What changes between devices
   isn't really width, it's how far the screen is and which hand is free:
   a phone in an apron pocket, an iPad propped on the counter, a laptop in
   the back office. Width alone can't tell those apart — an iPad Pro is
   1366px wide AND finger-driven, and for two years that made it inherit
   the mouse layout (hover-only nav tooltips, 26px steppers).

   So we publish TWO orthogonal facts on <html>, and everything else —
   CSS and TSX alike — branches on those instead of inventing breakpoints:

     data-posture   pocket | counter | desk      → LAYOUT
     data-input     touch  | mouse               → CONTROL SIZE

       pocket    < 640px                  bottom tab bar + More sheet
       counter   >= 640px, coarse pointer  labeled rail, 96px
       desk      >= 640px, fine pointer    icon rail + hover tooltips

   An iPad with a Magic Keyboard reports `pointer: fine` and correctly
   becomes `desk` — the trackpad really is there. Split View reports a
   narrow width and correctly becomes `pocket`. Both are handled by
   listening to the queries rather than measuring once.

   FROZEN CONTRACT — the exported names, the attribute names and the three
   posture values are depended on by every stylesheet in the app and by
   the pre-paint script in index.html. Add to it; don't rename it.
   ===================================================================== */
import { useSyncExternalStore } from 'react';

export type Posture = 'pocket' | 'counter' | 'desk';
export type InputKind = 'touch' | 'mouse';

/** Widest viewport that still gets the phone shell. Mirrored in index.html
 *  and in the `@media(max-width:639px)` fallbacks in the stylesheets. */
export const POCKET_MAX = 639;

const WIDE = `(min-width:${POCKET_MAX + 1}px)`;
const COARSE = '(pointer: coarse)';

export interface PostureState {
  posture: Posture;
  input: InputKind;
  /** Fingers, not a cursor — true for both pocket and counter. */
  isTouch: boolean;
  isPocket: boolean;
  isCounter: boolean;
  isDesk: boolean;
}

function read(): { posture: Posture; input: InputKind } {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return { posture: 'desk', input: 'mouse' };
  }
  const wide = window.matchMedia(WIDE).matches;
  const coarse = window.matchMedia(COARSE).matches;
  return {
    posture: !wide ? 'pocket' : coarse ? 'counter' : 'desk',
    input: coarse ? 'touch' : 'mouse',
  };
}

function state(posture: Posture, input: InputKind): PostureState {
  return {
    posture,
    input,
    isTouch: input === 'touch',
    isPocket: posture === 'pocket',
    isCounter: posture === 'counter',
    isDesk: posture === 'desk',
  };
}

let current: PostureState = state('desk', 'mouse');
let started = false;
const listeners = new Set<() => void>();

/** Write the attributes CSS reads. Idempotent; safe to call on every change. */
function publish() {
  const { posture, input } = read();
  if (posture === current.posture && input === current.input && started) return;
  current = state(posture, input);
  const root = document.documentElement;
  root.dataset.posture = posture;
  root.dataset.input = input;
  listeners.forEach((l) => l());
}

/** Start tracking. Called once from main.tsx; the pre-paint script in
 *  index.html has already set the attributes so there is no flash. */
export function initPosture() {
  if (started || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
  publish();
  started = true;
  // Both queries can flip without a resize: attaching a trackpad to an iPad
  // changes `pointer` while the width stays put.
  for (const q of [window.matchMedia(WIDE), window.matchMedia(COARSE)]) {
    if (typeof q.addEventListener === 'function') q.addEventListener('change', publish);
    else q.addListener(publish); // Safari < 14
  }
}

function subscribe(onChange: () => void) {
  if (!started) initPosture();
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function snapshot() {
  return current;
}

/** How the app is being held, right now. Re-renders on rotate, resize,
 *  Split View, and trackpad attach/detach. */
export function usePosture(): PostureState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
