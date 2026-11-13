import type { PortInfo } from 'ivandaw-core';
import { describe, expect, it } from 'vitest';
import {
  bezierPoint,
  cableCurve,
  cableMidpoint,
  cablePath,
  clampToWorld,
  FOOTER_H,
  HEADER_H,
  layoutPorts,
  NODE_W,
  nodeHeight,
  nodeSize,
  portAt,
  portCenter,
  ROW_H,
  toWorld,
  uiTop,
  WHEEL_LINE_PX,
  WORLD_MIN,
  wheelPan,
} from './geometry';

const ports: PortInfo[] = [
  { id: 'in', label: 'in', kind: 'events', direction: 'in', accepts: ['midi'] },
  { id: 'in2', label: 'in2', kind: 'audio', direction: 'in', channels: 2, main: false },
  { id: 'out', label: 'out', kind: 'audio', direction: 'out', channels: 2, main: true },
];

describe('layout', () => {
  const l = layoutPorts(ports);
  it('numbers rows per side', () => {
    expect(l.map((p) => p.row)).toEqual([0, 1, 0]);
  });
  it('height covers the taller side', () => {
    expect(nodeHeight(l)).toBe(HEADER_H + 12 + 2 * ROW_H);
    expect(nodeHeight([])).toBe(HEADER_H + 12);
    expect(nodeHeight(l, true)).toBe(HEADER_H + 12 + 2 * ROW_H + FOOTER_H);
  });
  it('makes room for a plugin UI: wider box, UI under the ports, outputs on the right edge', () => {
    const ui = { width: 746, height: 638 };
    expect(nodeSize(l, true, ui)).toEqual({
      w: 746,
      h: HEADER_H + 12 + 2 * ROW_H + 638 + FOOTER_H,
    });
    expect(nodeSize([], false, { width: 100, height: 50 }).w).toBe(NODE_W);
    expect(uiTop(l)).toBe(HEADER_H + 12 + 2 * ROW_H);
    const out = l.find((p) => p.direction === 'out');
    if (!out) throw new Error('no out');
    expect(portCenter({ x: 10, y: 0 }, out, 746).x).toBe(756);
  });
  it('puts inputs on the left edge and outputs on the right', () => {
    const origin = { x: 100, y: 50 };
    const a = l[0];
    const c = l[2];
    if (!a || !c) throw new Error('layout');
    expect(portCenter(origin, a)).toEqual({ x: 100, y: 50 + HEADER_H + 6 + 11 });
    expect(portCenter(origin, c)).toEqual({ x: 100 + NODE_W, y: 50 + HEADER_H + 6 + 11 });
  });
});

describe('cables', () => {
  const from = { x: 0, y: 0 };
  const to = { x: 300, y: 100 };
  it('control points are 80px out horizontally', () => {
    const [, b, c] = cableCurve(from, to);
    expect(b).toEqual({ x: 80, y: 0 });
    expect(c).toEqual({ x: 220, y: 100 });
  });
  it('builds an SVG path', () => {
    expect(cablePath(from, to)).toBe('M 0 0 C 80 0, 220 100, 300 100');
  });
  it('bezier hits its end points and middle', () => {
    const c = cableCurve(from, to);
    expect(bezierPoint(c, 0)).toEqual(from);
    expect(bezierPoint(c, 1)).toEqual(to);
    expect(cableMidpoint(from, to)).toEqual({ x: 150, y: 50 });
  });
});

describe('hit testing and camera', () => {
  const spots = [
    { ref: { node: 'a', port: 'in' }, center: { x: 10, y: 10 } },
    { ref: { node: 'b', port: 'in' }, center: { x: 30, y: 10 } },
  ];
  it('finds the nearest port in range', () => {
    expect(portAt({ x: 28, y: 12 }, spots)?.ref.node).toBe('b');
    expect(portAt({ x: 100, y: 100 }, spots)).toBeUndefined();
  });
  it('lets a node go anywhere above the world minimum', () => {
    expect(clampToWorld({ x: -20, y: 5000 })).toEqual({ x: -20, y: 5000 });
    expect(clampToWorld({ x: -9000, y: -2500 })).toEqual({ x: WORLD_MIN, y: WORLD_MIN });
  });
  it('turns screen points into world points with the camera', () => {
    expect(toWorld({ x: 10, y: 20 }, { x: 0, y: 0 })).toEqual({ x: 10, y: 20 });
    expect(toWorld({ x: 10, y: 20 }, { x: 300, y: -50 })).toEqual({ x: 310, y: -30 });
  });
  it('a port is hit at the same screen spot after panning', () => {
    const camera = { x: 250, y: 40 };
    const shifted = spots.map((s) => ({ ...s, center: toWorld(s.center, camera) }));
    expect(portAt(toWorld({ x: 28, y: 12 }, camera), shifted)?.ref.node).toBe('b');
  });
  it('converts wheel deltas in pixel, line and page mode', () => {
    expect(wheelPan({ deltaX: 3, deltaY: -7, deltaMode: 0 }, 600)).toEqual({ x: 3, y: -7 });
    expect(wheelPan({ deltaX: 0, deltaY: 2, deltaMode: 1 }, 600)).toEqual({
      x: 0,
      y: 2 * WHEEL_LINE_PX,
    });
    expect(wheelPan({ deltaX: 0, deltaY: 1, deltaMode: 2 }, 600)).toEqual({ x: 0, y: 600 });
  });
});
