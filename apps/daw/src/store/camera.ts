// Camera math (v1.1.2): zoom with a snap at 100%, and the pan limits. Pure functions, unit-tested.
// The camera is view state: not part of the project, never saved. Plan: docs/v1.1.2-plan.md.

export interface Pt {
  x: number;
  y: number;
}

/** `x`, `y`: the world point at the canvas's top-left. `z`: scale, 1 = 100%. */
export interface Camera {
  x: number;
  y: number;
  z: number;
}

/** A world-space box: the min / max corners. */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Zoom level = log2(z). 0 is 100%; -2 is 25%; 1 is 200%. */
export const LEVEL_MIN = -2;
export const LEVEL_MAX = 1;
/** While the raw level is within this distance of 0, the shown level is exactly 0 (about 90%–111%). */
export const SNAP_BAND = 0.15;
/** Zoom level change per key press (Ctrl/Cmd + / -). √2 per press. */
export const KEY_STEP = 0.5;
/** Wheel px (pixel mode) for one zoom level. A mouse notch (~100 px) is a third of a level, ~1.26×. */
export const WHEEL_PX_PER_LEVEL = 300;
/** One wheel event never moves the zoom more than this, so a fast flick can't jump past the snap. */
export const WHEEL_MAX_STEP = 0.4;

export const levelOf = (z: number): number => Math.log2(z);

export const snapLevel = (raw: number): number => (Math.abs(raw) < SNAP_BAND ? 0 : raw);

/** Screen point (relative to the canvas) → world point. */
export const toWorld = (screen: Pt, c: Camera): Pt => ({
  x: screen.x / c.z + c.x,
  y: screen.y / c.z + c.y,
});

/** World point → screen point (relative to the canvas). */
export const toScreen = (world: Pt, c: Camera): Pt => ({
  x: (world.x - c.x) * c.z,
  y: (world.y - c.y) * c.z,
});

/** The camera at scale `z` that keeps the world point under screen point `at` where it is. */
export function zoomAround(c: Camera, at: Pt, z: number): Camera {
  const w = toWorld(at, c);
  return { x: w.x - at.x / z, y: w.y - at.y / z, z };
}

/** How much a ctrl + wheel event (or a pinch) changes the zoom level. Wheel up zooms in. */
export function wheelZoom(deltaY: number, deltaMode: number, pageH: number): number {
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * pageH : deltaY;
  const d = -px / WHEEL_PX_PER_LEVEL;
  return Math.max(-WHEEL_MAX_STEP, Math.min(WHEEL_MAX_STEP, d));
}

/** The box around all node boxes, or undefined for no boxes. */
export function boundsOf(boxes: readonly Rect[]): Rect | undefined {
  if (boxes.length === 0) return undefined;
  const b = { ...boxes[0] } as Rect;
  for (const r of boxes) {
    b.left = Math.min(b.left, r.left);
    b.top = Math.min(b.top, r.top);
    b.right = Math.max(b.right, r.right);
    b.bottom = Math.max(b.bottom, r.bottom);
  }
  return b;
}

/** Keeps `v` in [lo, hi], but never pulls it past where it already was (`prev`), so nothing jumps. */
const softClamp = (v: number, prev: number, lo: number, hi: number): number =>
  Math.max(Math.min(lo, prev), Math.min(Math.max(hi, prev), v));

/**
 * The pan limit: the centre of the view stays inside `bounds` (all node boxes), which leaves at most
 * half a screen of empty space past the outermost node on each side, at any zoom.
 * If the view centre is already outside (a node was deleted, the window resized), a move may go
 * back towards the bounds but not further out: the camera never jumps on its own.
 * `view` is the canvas size in screen px.
 */
export function clampCamera(
  next: Camera,
  prev: Camera,
  view: { w: number; h: number },
  bounds: Rect | undefined,
): Camera {
  if (!bounds) return next;
  const hw = view.w / 2;
  const hh = view.h / 2;
  const cx = softClamp(next.x + hw / next.z, prev.x + hw / prev.z, bounds.left, bounds.right);
  const cy = softClamp(next.y + hh / next.z, prev.y + hh / prev.z, bounds.top, bounds.bottom);
  const x = cx - hw / next.z;
  const y = cy - hh / next.z;
  return x === next.x && y === next.y ? next : { x, y, z: next.z };
}
