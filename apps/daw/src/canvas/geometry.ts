// Pure canvas geometry: node layout, port positions, cable curves, hit testing, camera.
// No DOM here, so every function is unit-tested. Tech design: "Canvas".

import type { PortInfo } from 'ivandaw-core';
import type { PortRef } from '../model/project';

export const NODE_W = 180;
export const HEADER_H = 28;
export const ROW_H = 22;
export const BODY_PAD = 6;
/** Volume + pan footer on nodes with a main audio out, and on Master (v1.1). */
export const FOOTER_H = 52;
export const PORT_D = 12;
export const CURVE_OUT = 80;
export const CABLE_HIT_W = 12;
/** How close (px) a pointer must be to a port centre to count as over it. */
export const PORT_HIT_R = 12;

export interface Pt {
  x: number;
  y: number;
}
export interface Size {
  w: number;
  h: number;
}

export interface PortLayout {
  id: string;
  label: string;
  kind: PortInfo['kind'];
  direction: 'in' | 'out';
  /** Row index among the ports on the same side. */
  row: number;
}

/** Inputs go on the left, outputs on the right; each side fills its rows top to bottom. */
export function layoutPorts(
  ports: readonly Pick<PortInfo, 'id' | 'label' | 'kind' | 'direction'>[],
): PortLayout[] {
  const rows = { in: 0, out: 0 };
  return ports.map((p) => ({
    id: p.id,
    label: p.label,
    kind: p.kind,
    direction: p.direction,
    row: rows[p.direction]++,
  }));
}

/** Top of a plugin UI inside its box: under the header and the port rows. */
export function uiTop(layout: readonly PortLayout[]): number {
  const ins = layout.filter((p) => p.direction === 'in').length;
  const outs = layout.length - ins;
  return HEADER_H + BODY_PAD * 2 + Math.max(ins, outs) * ROW_H;
}

/** A plugin UI's size inside a box, from `manifest.ui`. */
export interface UiBox {
  width: number;
  height: number;
}

/** Box width: 180, or the plugin UI's width when it is wider. */
export const nodeWidth = (ui?: UiBox): number => (ui ? Math.max(NODE_W, ui.width) : NODE_W);

/** Header, port rows, then the plugin UI (if any), then the volume / pan footer (if any). */
export function nodeHeight(layout: readonly PortLayout[], footer = false, ui?: UiBox): number {
  return uiTop(layout) + (ui ? ui.height : 0) + (footer ? FOOTER_H : 0);
}

export const nodeSize = (layout: readonly PortLayout[], footer = false, ui?: UiBox): Size => ({
  w: nodeWidth(ui),
  h: nodeHeight(layout, footer, ui),
});

/** Port centre relative to the node's top-left corner. Inputs sit on the left edge, outputs on the right. */
export function portOffset(p: PortLayout, width = NODE_W): Pt {
  return {
    x: p.direction === 'in' ? 0 : width,
    y: HEADER_H + BODY_PAD + p.row * ROW_H + ROW_H / 2,
  };
}

export function portCenter(origin: Pt, p: PortLayout, width = NODE_W): Pt {
  const o = portOffset(p, width);
  return { x: origin.x + o.x, y: origin.y + o.y };
}

/** Cubic Bézier between two port centres, control points CURVE_OUT px out horizontally. */
export function cableCurve(from: Pt, to: Pt): [Pt, Pt, Pt, Pt] {
  return [from, { x: from.x + CURVE_OUT, y: from.y }, { x: to.x - CURVE_OUT, y: to.y }, to];
}

const f = (n: number): string => String(Math.round(n * 100) / 100);

export function cablePath(from: Pt, to: Pt): string {
  const [a, b, c, d] = cableCurve(from, to);
  return `M ${f(a.x)} ${f(a.y)} C ${f(b.x)} ${f(b.y)}, ${f(c.x)} ${f(c.y)}, ${f(d.x)} ${f(d.y)}`;
}

export function bezierPoint(c: readonly [Pt, Pt, Pt, Pt], t: number): Pt {
  const u = 1 - t;
  const [a, b, cc, d] = c;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return {
    x: w0 * a.x + w1 * b.x + w2 * cc.x + w3 * d.x,
    y: w0 * a.y + w1 * b.y + w2 * cc.y + w3 * d.y,
  };
}

export const cableMidpoint = (from: Pt, to: Pt): Pt => bezierPoint(cableCurve(from, to), 0.5);

export interface PortSpot {
  ref: PortRef;
  center: Pt;
}

/** The nearest port within `radius` of `p`, or undefined. */
export function portAt(
  p: Pt,
  spots: readonly PortSpot[],
  radius = PORT_HIT_R,
): PortSpot | undefined {
  let best: PortSpot | undefined;
  let bestD = radius * radius;
  for (const s of spots) {
    const d = (s.center.x - p.x) ** 2 + (s.center.y - p.y) ** 2;
    if (d <= bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

/** The lowest world x / y a node may have, so a box dragged far off can still be found. */
export const WORLD_MIN = -2000;

/** Keeps a node's top-left at or above WORLD_MIN. There is no upper limit: the camera follows. */
export function clampToWorld(pos: Pt): Pt {
  return { x: Math.max(WORLD_MIN, pos.x), y: Math.max(WORLD_MIN, pos.y) };
}

/** Screen point (relative to the canvas) → world point, for a camera whose top-left is at `camera`. */
export const toWorld = (screen: Pt, camera: Pt): Pt => ({
  x: screen.x + camera.x,
  y: screen.y + camera.y,
});

/** Pixels per line for wheel events in line mode (Firefox mouse wheels). */
export const WHEEL_LINE_PX = 16;

/** How far a wheel event moves the camera, in px. Page mode moves one `pageH`. */
export function wheelPan(
  e: { deltaX: number; deltaY: number; deltaMode: number },
  pageH: number,
): Pt {
  const k = e.deltaMode === 1 ? WHEEL_LINE_PX : e.deltaMode === 2 ? pageH : 1;
  return { x: e.deltaX * k, y: e.deltaY * k };
}
