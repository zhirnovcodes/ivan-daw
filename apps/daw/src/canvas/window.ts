// v1.2 plugin window layout. Pure: no DOM, unit-tested. Design: docs/v1.2-redesign.md, "4. Plugin windows"
// and "7. ARM connections".
//
//   ┌ title bar: [✓] Name                    ? _ X ┐
//   │ MIDI IN │                         │ MIDI OUT  │
//   │ AUD IN  │  plugin UI / parameters │ AUD OUT   │
//   │ ARM IN  │  Volume / Pan           │ ARM OUT   │
//   │ 1 2 3 … │                         │ 1 2 3 …   │
//   │ < >     │                         │ < >       │
//   └─────────────────────────────────────────────────┘
//
// Every input is on the left, every output on the right. The ARM strips fill the rest of their column,
// so the window's height decides how many ARM connectors show; `<` / `>` page through 1..16.

import { ARM_SLOTS } from '../model/project';
import type { Pt } from './geometry';

export const FRAME = 4;
export const TITLE_H = 18;
/** Mobile mode (2026-11-26): the title bar is 1.5 times taller, for fingers. */
export const MOBILE_TITLE_H = 27;
export const GAP = 4;
export const SIDE_W = 44;
/** Group box: two label lines ("MIDI" / "IN") and padding. */
export const LABEL_H = 28;
export const DOT_ROW = 20;
export const ARM_ROW = 30;
export const PAGER_H = 22;
export const GROUP_PAD = 4;
export const FOOTER_H = 50;
export const FOOTER_W = 220;
export const PARAM_ROW = 24;
export const PARAMS_W = 260;
export const CENTRE_MIN_W = 120;
export const CENTRE_MIN_H = 40;
/** Sunken frame around a plugin's own UI. */
export const UI_INSET = 2;

export type GroupKind = 'midi' | 'audio' | 'arm';
export type Side = 'in' | 'out';

export interface PortLite {
  id: string;
  label: string;
  kind: 'audio' | 'events' | 'modulation';
}

export interface WindowSpec {
  ins: readonly PortLite[];
  outs: readonly PortLite[];
  armIn: boolean;
  armOut: boolean;
  /** The plugin's own UI, when it has one and it is shown. */
  ui?: { width: number; height: number };
  /** Rows of the generic parameter strip (plugins without their own UI). */
  paramRows: number;
  footer: boolean;
  /** Title bar height; TITLE_H when left out. */
  titleH?: number;
  /** Current ARM page per side, 0-based. */
  page?: { in?: number; out?: number };
}

export interface Dot {
  /** Port id, or `arm:<index>` for an ARM connector. */
  key: string;
  label: string;
  /** ARM connectors only: 1..16. */
  index?: number;
  /** Centre, relative to the window's top-left. */
  x: number;
  y: number;
}

export interface Group {
  side: Side;
  kind: GroupKind;
  label: [string, string];
  x: number;
  y: number;
  w: number;
  h: number;
  dots: Dot[];
  /** ARM groups: how many connectors fit, the page shown, the page count, the pager row's centre y. */
  arm?: { perPage: number; page: number; pages: number; pagerY: number };
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WindowLayout {
  w: number;
  h: number;
  groups: Group[];
  ui?: Box;
  params?: Box;
  footer?: Box;
}

const KIND_LABEL: Record<GroupKind, string> = { midi: 'MIDI', audio: 'AUD', arm: 'ARM' };
const portGroup = (p: PortLite): GroupKind | undefined =>
  p.kind === 'events' ? 'midi' : p.kind === 'audio' ? 'audio' : undefined;

const groupH = (n: number): number => LABEL_H + n * DOT_ROW + GROUP_PAD;
const armMinH = LABEL_H + ARM_ROW + PAGER_H + GROUP_PAD;

interface ColumnSpec {
  side: Side;
  port: { kind: GroupKind; ports: PortLite[] }[];
  arm: boolean;
}

function column(side: Side, ports: readonly PortLite[], arm: boolean): ColumnSpec {
  const out: ColumnSpec = { side, port: [], arm };
  for (const kind of ['midi', 'audio'] as const) {
    const list = ports.filter((p) => portGroup(p) === kind);
    if (list.length > 0) out.port.push({ kind, ports: list });
  }
  return out;
}

const fixedH = (c: ColumnSpec): number =>
  c.port.reduce((h, g, i) => h + groupH(g.ports.length) + (i > 0 ? GAP : 0), 0);

const columnMinH = (c: ColumnSpec): number =>
  fixedH(c) + (c.arm ? (c.port.length > 0 ? GAP : 0) + armMinH : 0);

const hasColumn = (c: ColumnSpec): boolean => c.port.length > 0 || c.arm;

export function layoutWindow(spec: WindowSpec): WindowLayout {
  const left = column('in', spec.ins, spec.armIn);
  const right = column('out', spec.outs, spec.armOut);

  // Centre column: plugin UI or parameter strip, then Volume / Pan.
  const parts: { kind: 'ui' | 'params' | 'footer'; w: number; h: number }[] = [];
  if (spec.ui) {
    parts.push({ kind: 'ui', w: spec.ui.width + UI_INSET * 2, h: spec.ui.height + UI_INSET * 2 });
  }
  if (!spec.ui && spec.paramRows > 0) {
    parts.push({ kind: 'params', w: PARAMS_W, h: spec.paramRows * PARAM_ROW + 8 });
  }
  if (spec.footer) parts.push({ kind: 'footer', w: FOOTER_W, h: FOOTER_H });
  const centreW = Math.max(CENTRE_MIN_W, ...parts.map((p) => p.w));
  const centreH = Math.max(
    CENTRE_MIN_H,
    parts.reduce((h, p, i) => h + p.h + (i > 0 ? GAP : 0), 0),
  );
  const contentH = Math.max(centreH, columnMinH(left), columnMinH(right));

  const top = FRAME + (spec.titleH ?? TITLE_H) + GAP;
  const leftW = hasColumn(left) ? SIDE_W + GAP : 0;
  const rightW = hasColumn(right) ? GAP + SIDE_W : 0;
  const centreX = FRAME + leftW;
  const w = centreX + centreW + rightW + FRAME;
  const h = top + contentH + FRAME;

  const layout: WindowLayout = { w, h, groups: [] };
  let y = top;
  for (const p of parts) {
    // The UI and the parameter strip keep their own width; the footer spans the centre.
    const box = { x: centreX, y, w: p.kind === 'footer' ? centreW : p.w, h: p.h };
    if (p.kind === 'footer') box.y = top + contentH - p.h; // Volume / Pan sit at the bottom
    layout[p.kind] = box;
    y += p.h + GAP;
  }

  const place = (c: ColumnSpec, x: number): void => {
    let gy = top;
    for (const g of c.port) {
      const gh = groupH(g.ports.length);
      layout.groups.push({
        side: c.side,
        kind: g.kind,
        label: [KIND_LABEL[g.kind], c.side === 'in' ? 'IN' : 'OUT'],
        x,
        y: gy,
        w: SIDE_W,
        h: gh,
        dots: g.ports.map((p, i) => ({
          key: p.id,
          label: p.label,
          x: x + SIDE_W / 2,
          y: gy + LABEL_H + i * DOT_ROW + DOT_ROW / 2,
        })),
      });
      gy += gh + GAP;
    }
    if (!c.arm) return;
    const gh = top + contentH - gy;
    const perPage = Math.max(
      1,
      Math.min(ARM_SLOTS, Math.floor((gh - LABEL_H - PAGER_H - GROUP_PAD) / ARM_ROW)),
    );
    const pages = Math.ceil(ARM_SLOTS / perPage);
    const asked = (c.side === 'in' ? spec.page?.in : spec.page?.out) ?? 0;
    const page = Math.max(0, Math.min(pages - 1, asked));
    const dots: Dot[] = [];
    for (let i = 0; i < perPage; i++) {
      const index = page * perPage + i + 1;
      if (index > ARM_SLOTS) break;
      dots.push({
        key: `arm:${index}`,
        label: String(index),
        index,
        x: x + SIDE_W / 2,
        y: gy + LABEL_H + i * ARM_ROW + ARM_ROW - 10,
      });
    }
    layout.groups.push({
      side: c.side,
      kind: 'arm',
      label: ['ARM', c.side === 'in' ? 'IN' : 'OUT'],
      x,
      y: gy,
      w: SIDE_W,
      h: gh,
      dots,
      arm: { perPage, page, pages, pagerY: gy + gh - GROUP_PAD - PAGER_H / 2 },
    });
  };
  if (hasColumn(left)) place(left, FRAME);
  if (hasColumn(right)) place(right, w - FRAME - SIDE_W);
  return layout;
}

/** A port's connector centre, relative to the window, or undefined if it has no connector. */
export function portDot(layout: WindowLayout, side: Side, port: string): Pt | undefined {
  for (const g of layout.groups) {
    if (g.side !== side || g.kind === 'arm') continue;
    const d = g.dots.find((x) => x.key === port);
    if (d) return { x: d.x, y: d.y };
  }
  return undefined;
}

/**
 * Where an ARM connector's cable ends, relative to the window: the connector when its page is shown,
 * else the middle of the pager row, so cables to other pages still lead somewhere.
 */
export function armDot(layout: WindowLayout, side: Side, index: number): Pt | undefined {
  const g = layout.groups.find((x) => x.side === side && x.kind === 'arm');
  if (!g?.arm) return undefined;
  const d = g.dots.find((x) => x.index === index);
  if (d) return { x: d.x, y: d.y };
  return { x: g.x + g.w / 2, y: g.arm.pagerY };
}
