// Play-only mode on the canvas. Design: docs/v1.1-tech-design.md, "7. Play-only mode"; v1.2 ARM links.
// The graph is locked: no moving or removing nodes, no audio or notes cable edits. ARM links (the v1.2
// control connections) may still be drawn, edited and deleted, and everything that shapes the sound stays live.

import type { Effect, Target } from './gesture';

export type Mode = 'edit' | 'play';

/**
 * What a pointer-down becomes in this mode, or undefined to ignore it.
 * In play mode a header grab only selects, and audio / notes outputs don't start a cable.
 */
export function playTarget(mode: Mode, t: Target, outPortKind?: string): Target | undefined {
  if (mode === 'edit') return t;
  if (t.kind === 'header') return { kind: 'body', node: t.node };
  if (t.kind === 'outPort' && outPortKind !== 'modulation') return undefined;
  return t;
}

/** Whether a canvas effect may run in this mode. */
export function permits(mode: Mode, e: Effect): boolean {
  if (mode === 'edit') return true;
  switch (e.type) {
    case 'moveNode':
    case 'removeNode':
    case 'disconnect':
    case 'connect':
      return false;
    default:
      return true;
  }
}
