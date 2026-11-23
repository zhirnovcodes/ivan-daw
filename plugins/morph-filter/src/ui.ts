// The plugin's own UI, from the design (Frame 3): a 128 x 128 box, two knobs, D/W and FREQ.
// Drag a knob up/down (Shift = fine), scroll it, double-click to reset.

import { UI_SIZE } from './manifest';
import { clamp01, type ParamId } from './params';

const SVG_NS = 'http://www.w3.org/2000/svg';

const COLORS = {
  box: '#FFCB9E',
  knob: '#ECA86D',
  center: '#FFA7A1',
  pointer: '#B56E2F',
  label: '#000000',
};

const KNOB_R = 12;
const POINTER_R = 2;
// The design's pointer sits at (-6, +7) from the centre: the knob at its minimum.
const POINTER_DIST = Math.hypot(6, 7);
const MIN_ANGLE = Math.atan2(7, -6); // screen coords, y down
const SWEEP = (3 * Math.PI) / 2; // 270 degrees, clockwise
const DRAG_PX = 150; // full range
const FINE = 0.1;

interface KnobSpec {
  id: ParamId;
  label: string;
  cx: number; // centre in the 128 x 128 box
  cy: number;
}

export const KNOBS: readonly KnobSpec[] = [
  { id: 'dw', label: 'D/W', cx: 26, cy: 40 },
  { id: 'freq', label: 'FREQ', cx: 103, cy: 40 },
];

/** Where the pointer dot sits for a 0..1 value, relative to the knob centre. */
export function pointerOffset(value: number): { x: number; y: number } {
  const a = MIN_ANGLE + SWEEP * clamp01(value);
  return { x: POINTER_DIST * Math.cos(a), y: POINTER_DIST * Math.sin(a) };
}

export interface UiBridge {
  get(id: ParamId): number;
  /** A change from the UI. `gesture` frames a drag. */
  set(id: ParamId, value: number, gesture?: 'begin' | 'end'): void;
  defaults: Record<ParamId, number>;
  format: Record<ParamId, (v: number) => string>;
}

export interface MountedUi {
  /** Redraw one knob (after automation, state load, ...). */
  update(id: ParamId): void;
  destroy(): void;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

export function mountUi(container: HTMLElement, bridge: UiBridge): MountedUi {
  const svg = el('svg', {
    width: UI_SIZE,
    height: UI_SIZE,
    viewBox: `0 0 ${UI_SIZE} ${UI_SIZE}`,
  });
  svg.style.display = 'block';
  svg.style.userSelect = 'none';
  svg.style.touchAction = 'none';
  svg.append(el('rect', { width: UI_SIZE, height: UI_SIZE, fill: COLORS.box }));

  const redraws = new Map<ParamId, () => void>();
  const cleanups: (() => void)[] = [];

  for (const k of KNOBS) {
    const g = el('g', { cursor: 'ns-resize' });
    const title = el('title', {});
    const pointer = el('circle', { r: POINTER_R, fill: COLORS.pointer });
    g.append(
      title,
      el('circle', { cx: k.cx, cy: k.cy, r: KNOB_R, fill: COLORS.knob }),
      el('circle', { cx: k.cx, cy: k.cy, r: 4, fill: COLORS.center }),
      pointer,
    );
    const text = el('text', {
      x: k.cx,
      y: k.cy + 29,
      'text-anchor': 'middle',
      'font-family': '"Times New Roman", Times, serif',
      'font-size': 12,
      fill: COLORS.label,
      'pointer-events': 'none',
    });
    text.textContent = k.label;
    svg.append(g, text);

    const redraw = () => {
      const v = bridge.get(k.id);
      const p = pointerOffset(v);
      pointer.setAttribute('cx', String(k.cx + p.x));
      pointer.setAttribute('cy', String(k.cy + p.y));
      title.textContent = `${k.label} ${bridge.format[k.id](v)}`;
    };
    redraws.set(k.id, redraw);
    redraw();

    let drag: { y: number; start: number; pointer: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation(); // the canvas must not start dragging the node
      g.setPointerCapture(e.pointerId);
      drag = { y: e.clientY, start: bridge.get(k.id), pointer: e.pointerId };
      bridge.set(k.id, drag.start, 'begin');
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointer) return;
      const scale = e.shiftKey ? FINE : 1;
      bridge.set(k.id, clamp01(drag.start + ((drag.y - e.clientY) / DRAG_PX) * scale));
      redraw();
    };
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointer) return;
      drag = null;
      bridge.set(k.id, bridge.get(k.id), 'end');
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const step = (e.shiftKey ? 0.005 : 0.03) * -Math.sign(e.deltaY);
      bridge.set(k.id, clamp01(bridge.get(k.id) + step));
      redraw();
    };
    const onDouble = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      bridge.set(k.id, bridge.defaults[k.id]);
      redraw();
    };
    g.addEventListener('pointerdown', onDown);
    g.addEventListener('pointermove', onMove);
    g.addEventListener('pointerup', onUp);
    g.addEventListener('pointercancel', onUp);
    g.addEventListener('wheel', onWheel, { passive: false });
    g.addEventListener('dblclick', onDouble);
    cleanups.push(() => {
      g.removeEventListener('pointerdown', onDown);
      g.removeEventListener('pointermove', onMove);
      g.removeEventListener('pointerup', onUp);
      g.removeEventListener('pointercancel', onUp);
      g.removeEventListener('wheel', onWheel);
      g.removeEventListener('dblclick', onDouble);
    });
  }

  container.append(svg);
  return {
    update: (id) => redraws.get(id)?.(),
    destroy() {
      for (const c of cleanups) c();
      svg.remove();
    },
  };
}
