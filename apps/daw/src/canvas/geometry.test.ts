import type { PortInfo } from 'ivandaw-core';
import { describe, expect, it } from 'vitest';
import {
  bezierPoint,
  cableCurve,
  cableMidpoint,
  cablePath,
  clampToBounds,
  HEADER_H,
  layoutPorts,
  NODE_W,
  nodeHeight,
  portAt,
  portCenter,
  ROW_H,
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

describe('hit testing and bounds', () => {
  const spots = [
    { ref: { node: 'a', port: 'in' }, center: { x: 10, y: 10 } },
    { ref: { node: 'b', port: 'in' }, center: { x: 30, y: 10 } },
  ];
  it('finds the nearest port in range', () => {
    expect(portAt({ x: 28, y: 12 }, spots)?.ref.node).toBe('b');
    expect(portAt({ x: 100, y: 100 }, spots)).toBeUndefined();
  });
  it('clamps a drag inside the canvas', () => {
    const size = { w: 180, h: 100 };
    const bounds = { w: 800, h: 600 };
    expect(clampToBounds({ x: -20, y: -5 }, size, bounds)).toEqual({ x: 0, y: 0 });
    expect(clampToBounds({ x: 900, y: 700 }, size, bounds)).toEqual({ x: 620, y: 500 });
    expect(clampToBounds({ x: 50, y: 60 }, size, bounds)).toEqual({ x: 50, y: 60 });
    expect(clampToBounds({ x: 50, y: 60 }, size, { w: 100, h: 50 })).toEqual({ x: 0, y: 0 });
  });
});
