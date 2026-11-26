// Page scrollbars (v1.2): a Win95 vertical bar on the right and a horizontal bar along the bottom.
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

/** Bar thickness (= the zoom block's height: 23 px buttons + 3 px padding) and arrow length, screen px. */
export const BAR = 29;
/** The zoom block (canvas/styles.ts .ivd-zoombar): at --ivd-left, fixed width 3+23+2+52+2+23+3 = 108 px. */
const ZOOM_W = 108;
export const ARROW = 25;
/** The thumb never gets shorter than this, screen px. */
export const THUMB_MIN = 20;
/** One arrow click moves this many screen px. */
export const ARROW_STEP = 40;

export const SCROLLBAR_CSS = `
.ivd-sbar { position: absolute; z-index: 10; display: flex; background: var(--w95-hilite);
  box-shadow: 1px 1px 1px rgba(0,0,0,.5), inset 0 4px 4px rgba(0,0,0,.25); touch-action: none; }
.ivd-sbar.h { left: calc(var(--ivd-left, 16px) + ${ZOOM_W}px); right: calc(var(--ivd-right, 16px) + ${BAR}px);
  bottom: var(--ivd-bottom, 16px); height: ${BAR}px; flex-direction: row; }
.ivd-sbar.v { right: var(--ivd-right, 16px); top: 0; bottom: calc(var(--ivd-bottom, 16px) + ${BAR}px); width: ${BAR}px;
  flex-direction: column; }
.ivd-sbar-corner { position: absolute; z-index: 10; right: var(--ivd-right, 16px); bottom: var(--ivd-bottom, 16px);
  width: ${BAR}px; height: ${BAR}px;
  background: var(--w95-hilite); box-shadow: 1px 1px 1px rgba(0,0,0,.5); }
.ivd-sbar-track { position: relative; flex: 1; }
.ivd-sbar-btn, .ivd-sbar-thumb { background: var(--w95-face); border: 0; border-radius: 0; padding: 0; margin: 0;
  box-shadow: inset 2px 2px 1px rgba(255,255,255,.5), inset -2px -2px 2px rgba(0,0,0,.5); }
.ivd-sbar-btn { flex: none; cursor: pointer; background-position: center; background-repeat: no-repeat; }
.ivd-sbar-btn:active { box-shadow: inset 2px 2px 2px rgba(0,0,0,.5), inset -2px -2px 1px rgba(255,255,255,.5); }
.ivd-sbar.h .ivd-sbar-btn { width: ${ARROW}px; height: ${BAR}px; }
.ivd-sbar.v .ivd-sbar-btn { width: ${BAR}px; height: ${ARROW}px; }
.ivd-sbar-btn.left { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='16'%3E%3Cpath d='M6 0v16L0 8z'/%3E%3C/svg%3E"); }
.ivd-sbar-btn.right { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='16'%3E%3Cpath d='M0 0v16L6 8z'/%3E%3C/svg%3E"); }
.ivd-sbar-btn.up { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='6'%3E%3Cpath d='M0 6h16L8 0z'/%3E%3C/svg%3E"); }
.ivd-sbar-btn.down { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='6'%3E%3Cpath d='M0 0h16L8 6z'/%3E%3C/svg%3E"); }
.ivd-sbar-thumb { position: absolute; }
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
  const corner = div('ivd-sbar-corner');
  const bars = {} as Record<
    Axis,
    { bar: HTMLDivElement; track: HTMLDivElement; thumb: HTMLDivElement }
  >;
  const stopAll = (el: HTMLElement): void => {
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  };
  stopAll(corner);

  const move = (axis: Axis, world: number): void => (axis === 'x' ? pan(world, 0) : pan(0, world));

  for (const axis of ['x', 'y'] as const) {
    const bar = div(`ivd-sbar ${axis === 'x' ? 'h' : 'v'}`);
    bar.setAttribute('role', 'scrollbar');
    bar.setAttribute('aria-orientation', axis === 'x' ? 'horizontal' : 'vertical');
    const track = div('ivd-sbar-track');
    const thumb = div('ivd-sbar-thumb');
    track.append(thumb);
    const arrow = (cls: string, dir: -1 | 1, label: string): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `ivd-sbar-btn ${cls}`;
      b.title = label;
      b.setAttribute('aria-label', label);
      b.tabIndex = -1;
      // Held down: one step, then repeats while pressed (UI only, not musical timing).
      let timer: number | undefined;
      const step = (): void => move(axis, (dir * ARROW_STEP) / read().z);
      const stop = (): void => {
        window.clearInterval(timer);
        timer = undefined;
      };
      b.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        step();
        stop();
        const delay = window.setTimeout(() => {
          timer = window.setInterval(step, 50);
        }, 350);
        const up = (): void => {
          window.clearTimeout(delay);
          stop();
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
        };
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      });
      return b;
    };
    const [a, b] =
      axis === 'x'
        ? [arrow('left', -1, 'Scroll left'), arrow('right', 1, 'Scroll right')]
        : [arrow('up', -1, 'Scroll up'), arrow('down', 1, 'Scroll down')];
    bar.append(a, track, b);
    stopAll(bar);

    // Click on the track: one page towards the click.
    track.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target !== track) return;
      const r = thumb.getBoundingClientRect();
      const at = axis === 'x' ? e.clientX : e.clientY;
      const before = axis === 'x' ? r.left : r.top;
      const ext = read()[axis];
      move(axis, at < before ? -ext.len * 0.9 : ext.len * 0.9);
    });

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
  canvas.append(corner);

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
      corner.remove();
    },
  };
}
