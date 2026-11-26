// Play-only mode on the canvas. Design: docs/v1.1-tech-design.md, "7. Play-only mode"; revised 2026-11-23.
// The wiring is locked: no adding or removing plugins, no cable or ARM link edits (cables are drawn
// dashed and can't be clicked). Plugins can still be moved, switched on / off, and everything that
// shapes the sound stays live.

import type { Effect, Target } from './gesture';

/** The page's ?mode=. 'dev' is edit mode plus the preset panel; the canvas treats it as edit. */
export type Mode = 'edit' | 'play' | 'dev';

/**
 * The canvas rules in force: the mode's, or 'mobile' (2026-11-26; ?mobile=, separate from the mode
 * since then), which is play-only for touch screens and stricter whatever the mode: plugins can't
 * be moved, switched on / off or opened; a finger drag anywhere pans the camera instead.
 */
export type Rules = Mode | 'mobile';

export const rulesFor = (mode: Mode, mobile: boolean): Rules => (mobile ? 'mobile' : mode);

/** Whether the wiring is locked: play-only and mobile. */
export const wiringLocked = (mode: Rules): boolean => mode === 'play' || mode === 'mobile';

/**
 * What a pointer-down becomes in this mode, or undefined to ignore it.
 * In play mode no connector starts a cable and no cable can be picked.
 */
export function playTarget(mode: Rules, t: Target): Target | undefined {
  if (mode === 'mobile') return t.kind === 'empty' || t.kind === 'body' ? t : undefined;
  if (mode !== 'play') return t;
  switch (t.kind) {
    case 'outPort':
    case 'armOut':
    case 'cable':
    case 'cableX':
    case 'armCable':
      return undefined;
    default:
      return t;
  }
}

/** Whether a canvas effect may run in this mode. */
export function permits(mode: Rules, e: Effect): boolean {
  if (mode === 'mobile') return e.type === 'select';
  if (mode !== 'play') return true;
  switch (e.type) {
    case 'removeNode':
    case 'disconnect':
    case 'connect':
    case 'connectArm':
    case 'removeArm':
      return false;
    default:
      return true;
  }
}
