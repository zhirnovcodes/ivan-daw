// Mobile mode (2026-11-26): the camera follows fingers. One finger drags the view, two fingers pan
// and pinch-zoom around their midpoint. Mouse (left button) works the same, for desktop testing.
// The step math is pure (`touchStep`, `fitView`); `mountTouchCamera` wires it to pointer events.

import { LEVEL_MAX, LEVEL_MIN, type Rect } from '../store/camera';
import type { Pt } from './geometry';

/** What the pointers moved since the last step: a screen-px pan and a zoom change in levels (log2). */
export interface TouchStep {
  /** Screen px the content moved; the camera moves the other way. */
  dx: number;
  dy: number;
  /** Zoom change in levels: +1 doubles. 0 with one finger. */
  dLevel: number;
  /** Where to zoom around, screen px. */
  at: Pt;
}

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * From the pointer positions before and after a move (same ids in both, at most the first two used),
 * the pan and zoom to apply. Undefined when there is nothing to do.
 */
export function touchStep(before: readonly Pt[], after: readonly Pt[]): TouchStep | undefined {
  if (before.length === 0 || before.length !== after.length) return undefined;
  if (before.length === 1) {
    const [a, b] = [before[0] as Pt, after[0] as Pt];
    return { dx: b.x - a.x, dy: b.y - a.y, dLevel: 0, at: b };
  }
  const [a0, a1, b0, b1] = [before[0], before[1], after[0], after[1]] as Pt[];
  const ma = mid(a0 as Pt, a1 as Pt);
  const mb = mid(b0 as Pt, b1 as Pt);
  const da = dist(a0 as Pt, a1 as Pt);
  const db = dist(b0 as Pt, b1 as Pt);
  const dLevel = da > 1 && db > 1 ? Math.log2(db / da) : 0;
  return { dx: mb.x - ma.x, dy: mb.y - ma.y, dLevel, at: mb };
}

/**
 * The camera that shows all of `bounds` (world px) inside `view` (screen px) with `pad` screen px
 * around it, zoom no higher than 100% and within the zoom limits.
 */
export function fitView(
  bounds: Rect,
  view: { w: number; h: number },
  pad = 16,
): { x: number; y: number; z: number } {
  const bw = Math.max(1, bounds.right - bounds.left);
  const bh = Math.max(1, bounds.bottom - bounds.top);
  const fit = Math.min((view.w - 2 * pad) / bw, (view.h - 2 * pad) / bh);
  const level = Math.min(0, LEVEL_MAX, Math.max(LEVEL_MIN, Math.log2(Math.max(fit, 1e-6))));
  const z = 2 ** level;
  const cx = (bounds.left + bounds.right) / 2;
  const cy = (bounds.top + bounds.bottom) / 2;
  return { x: cx - view.w / (2 * z), y: cy - view.h / (2 * z), z };
}

export interface TouchCameraOptions {
  /** Pointer position relative to the canvas, screen px. */
  screenPt(e: { clientX: number; clientY: number }): Pt;
  /** Apply a step: pan by screen px and zoom around a point. */
  apply(step: TouchStep): void;
  /** Targets that keep their pointer (Master's sliders, an uncovered plugin's UI, the zoom panel). */
  passThrough(target: Element): boolean;
  /** Called on the first gesture, so the view stops fitting itself. */
  onFirstGesture?(): void;
}

/** Listens on `canvas` (capture phase, so it wins over windows). Returns the cleanup. */
export function mountTouchCamera(canvas: HTMLElement, o: TouchCameraOptions): () => void {
  const pointers = new Map<number, Pt>();
  let touched = false;

  const down = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return; // right button keeps its own pan
    if (e.target instanceof Element && o.passThrough(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (pointers.size >= 2) return;
    pointers.set(e.pointerId, o.screenPt(e));
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic events may have no active pointer.
    }
    if (!touched) {
      touched = true;
      o.onFirstGesture?.();
    }
  };
  const move = (e: PointerEvent): void => {
    if (!pointers.has(e.pointerId)) return;
    e.preventDefault();
    const ids = [...pointers.keys()];
    const before = ids.map((id) => pointers.get(id) as Pt);
    pointers.set(e.pointerId, o.screenPt(e));
    const after = ids.map((id) => pointers.get(id) as Pt);
    const step = touchStep(before, after);
    if (step) o.apply(step);
  };
  const up = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
  };
  // iOS Safari's own page pinch.
  const gesture = (e: Event): void => e.preventDefault();

  canvas.addEventListener('pointerdown', down, { capture: true });
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('gesturestart', gesture);
  return () => {
    canvas.removeEventListener('pointerdown', down, { capture: true });
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', up);
    canvas.removeEventListener('gesturestart', gesture);
  };
}
