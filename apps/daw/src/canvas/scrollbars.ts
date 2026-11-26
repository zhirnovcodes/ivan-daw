// Page scrollbars (v1.2): a vertical thumb on the right and a horizontal thumb along the bottom, no arrows or track.
// Panels in the bottom-right (the dev preset panel) sit at right / bottom 53px: 16 + BAR + an 8px gap.
// They show where the view is inside the pannable area and move the camera; they never own state.
// The pannable area per axis is the pan limit (store/camera.ts clampCamera): the view centre stays
// inside the node bounds, so the scroll extent is the bounds grown by half a view on each side.

import type { Camera, Rect } from '../store/camera';

/** One axis, in world px. */
export interface ScrollExtent {
  /** World start and end of everything the view can scroll over. */
  min: number;
  max: number;
  /** World start and length of the view. */
  start: number;
  len: number;
}

/** The thumb, as fractions of the track: `pos` = start, `size` = length. */
export interface Thumb {
  pos: number;
  size: number;
}

/**
 * The scroll extent on one axis. `lo` / `hi`: node bounds (undefined = no nodes).
 * A view already outside the extent (a node was deleted) widens it, so the thumb never leaves the track.
 */
export function scrollExtent(
  start: number,
  len: number,
  lo: number | undefined,
  hi: number | undefined,
): ScrollExtent {
  if (lo === undefined || hi === undefined) return { min: start, max: start + len, start, len };
  const min = Math.min(lo - len / 2, start);
  const max = Math.max(hi + len / 2, start + len);
  return { min, max, start, len };
}

export function thumbOf(e: ScrollExtent): Thumb {
  const total = e.max - e.min;
  if (total <= 0) return { pos: 0, size: 1 };
  const size = Math.min(1, e.len / total);
  const pos = Math.max(0, Math.min(1 - size, (e.start - e.min) / total));
  return { pos, size };
}

/** World px moved when the thumb is dragged `dpx` screen px along a track of `trackPx` screen px. */
export function dragToWorld(dpx: number, trackPx: number, e: ScrollExtent): number {
  return trackPx > 0 ? (dpx * (e.max - e.min)) / trackPx : 0;
}

/** Both axes for a camera, a canvas size (screen px) and the node bounds. */
export function extentsOf(
  c: Camera,
  view: { w: number; h: number },
  bounds: Rect | undefined,
): { x: ScrollExtent; y: ScrollExtent } {
  return {
    x: scrollExtent(c.x, view.w / c.z, bounds?.left, bounds?.right),
    y: scrollExtent(c.y, view.h / c.z, bounds?.top, bounds?.bottom),
  };
}

/** Bar thickness (= the zoom block's height: 23 px buttons + 3 px padding), screen px. */
export const BAR = 29;
/** The zoom block (canvas/styles.ts .ivd-zoombar): at --ivd-left, fixed width 3+23+2+52+2+23+3 = 108 px. */
const ZOOM_W = 108;
/** The thumb never gets shorter than this, screen px. */
export const THUMB_MIN = 20;

/* Only the thumb is drawn (20% opaque); the bar itself is invisible and lets clicks through to the canvas. */
export const SCROLLBAR_CSS = `
.ivd-sbar { position: absolute; z-index: 10; display: flex; pointer-events: none; touch-action: none; }
.ivd-sbar.h { left: calc(var(--ivd-left, 16px) + ${ZOOM_W}px); right: calc(var(--ivd-right, 16px) + ${BAR}px);
  bottom: var(--ivd-bottom, 16px); height: ${BAR}px; flex-direction: row; }
.ivd-sbar.v { right: var(--ivd-right, 16px); top: 0; bottom: calc(var(--ivd-bottom, 16px) + ${BAR}px); width: ${BAR}px;
  flex-direction: column; }
.ivd-sbar-track { position: relative; flex: 1; }
.ivd-sbar-thumb { position: absolute; pointer-events: auto; opacity: .2; background: var(--w95-face);
  box-shadow: inset 2px 2px 1px rgba(255,255,255,.5), inset -2px -2px 2px rgba(0,0,0,.5); }
.ivd-sbar.h .ivd-sbar-thumb { top: 0; bottom: 0; }
.ivd-sbar.v .ivd-sbar-thumb { left: 0; right: 0; }
.ivd-sbar.full .ivd-sbar-thumb { display: none; }
`;

type Axis = 'x' | 'y';

/**
 * Builds both bars into `canvas`. `pan(dx, dy)` moves the camera by world px (with the pan limit);
 * `read()` returns the current extents. Call the returned `update` whenever the camera, the nodes or
 * the canvas size change.
 */
export function mountScrollbars(
  canvas: HTMLElement,
  read: () => { x: ScrollExtent; y: ScrollExtent; z: number },
  pan: (dx: number, dy: number) => void,
): { update: () => void; dispose: () => void } {
  const div = (cls: string): HTMLDivElement => {
    const d = document.createElement('div');
    d.className = cls;
    return d;
  };
  const bars = {} as Record<
    Axis,
    { bar: HTMLDivElement; track: HTMLDivElement; thumb: HTMLDivElement }
  >;
  const stopAll = (el: HTMLElement): void => {
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  };

  const move = (axis: Axis, world: number): void => (axis === 'x' ? pan(world, 0) : pan(0, world));

  for (const axis of ['x', 'y'] as const) {
    const bar = div(`ivd-sbar ${axis === 'x' ? 'h' : 'v'}`);
    bar.setAttribute('role', 'scrollbar');
    bar.setAttribute('aria-orientation', axis === 'x' ? 'horizontal' : 'vertical');
    const track = div('ivd-sbar-track');
    const thumb = div('ivd-sbar-thumb');
    track.append(thumb);
    bar.append(track);
    stopAll(thumb);

    // Drag the thumb.
    thumb.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const ext = read()[axis];
      const trackPx = axis === 'x' ? track.clientWidth : track.clientHeight;
      let last = axis === 'x' ? e.clientX : e.clientY;
      try {
        thumb.setPointerCapture(e.pointerId);
      } catch {
        // Synthetic events may have no active pointer.
      }
      const onMove = (m: PointerEvent): void => {
        const p = axis === 'x' ? m.clientX : m.clientY;
        move(axis, dragToWorld(p - last, trackPx, ext));
        last = p;
      };
      const onEnd = (): void => {
        thumb.removeEventListener('pointermove', onMove);
        thumb.removeEventListener('pointerup', onEnd);
        thumb.removeEventListener('pointercancel', onEnd);
      };
      thumb.addEventListener('pointermove', onMove);
      thumb.addEventListener('pointerup', onEnd);
      thumb.addEventListener('pointercancel', onEnd);
    });

    bars[axis] = { bar, track, thumb };
    canvas.append(bar);
  }

  const update = (): void => {
    const r = read();
    for (const axis of ['x', 'y'] as const) {
      const { bar, track, thumb } = bars[axis];
      const t = thumbOf(r[axis]);
      const trackPx = axis === 'x' ? track.clientWidth : track.clientHeight;
      bar.classList.toggle('full', t.size >= 1);
      const size = Math.min(trackPx, Math.max(THUMB_MIN, t.size * trackPx));
      const pos = t.size >= 1 ? 0 : (t.pos / (1 - t.size)) * (trackPx - size);
      if (axis === 'x') {
        thumb.style.left = `${pos}px`;
        thumb.style.width = `${size}px`;
      } else {
        thumb.style.top = `${pos}px`;
        thumb.style.height = `${size}px`;
      }
      bar.setAttribute('aria-valuenow', String(Math.round(t.pos * 100)));
    }
  };

  return {
    update,
    dispose: () => {
      bars.x.bar.remove();
      bars.y.bar.remove();
    },
  };
}
