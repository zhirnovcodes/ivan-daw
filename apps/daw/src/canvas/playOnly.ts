// Play-only mode on the canvas. Design: docs/v1.1-tech-design.md, "7. Play-only mode"; revised 2026-11-23.
// The wiring is locked: no adding or removing plugins, no cable or ARM link edits (cables are drawn
// dashed and can't be clicked). Plugins can still be moved, switched on / off, and everything that
// shapes the sound stays live.

import type { Effect, Target } from './gesture';

export type Mode = 'edit' | 'play';

/**
 * What a pointer-down becomes in this mode, or undefined to ignore it.
 * In play mode no connector starts a cable and no cable can be picked.
 */
export function playTarget(mode: Mode, t: Target): Target | undefined {
  if (mode === 'edit') return t;
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
export function permits(mode: Mode, e: Effect): boolean {
  if (mode === 'edit') return true;
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
