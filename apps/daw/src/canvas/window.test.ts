import { describe, expect, it } from 'vitest';
import {
  ARM_ROW,
  armDot,
  CENTRE_MIN_W,
  FOOTER_H,
  FRAME,
  GAP,
  layoutWindow,
  portDot,
  SIDE_W,
  TITLE_H,
  UI_INSET,
  type WindowSpec,
} from './window';

const midiIn = { id: 'in', label: 'in', kind: 'events' as const };
const midiOut = { id: 'out', label: 'out', kind: 'events' as const };
const audioOut = { id: 'out', label: 'out', kind: 'audio' as const };
const modOut = { id: 'out', label: 'out', kind: 'modulation' as const };

const synth = (over: Partial<WindowSpec> = {}): WindowSpec => ({
  ins: [midiIn],
  outs: [audioOut],
  armIn: true,
  armOut: false,
  ui: { width: 260, height: 306 },
  paramRows: 0,
  footer: true,
  ...over,
});

describe('layoutWindow', () => {
  it('puts inputs left, outputs right, and the UI then Volume / Pan in the middle', () => {
    const l = layoutWindow(synth());
    const top = FRAME + TITLE_H + GAP;
    expect(l.ui).toEqual({ x: FRAME + SIDE_W + GAP, y: top, w: 264, h: 310 });
    expect(l.w).toBe(FRAME + SIDE_W + GAP + 264 + GAP + SIDE_W + FRAME);
    expect(l.footer?.h).toBe(FOOTER_H);
    expect(l.footer?.y).toBe(l.h - FRAME - FOOTER_H);
    expect(l.groups.map((g) => `${g.side}:${g.kind}`)).toEqual(['in:midi', 'in:arm', 'out:audio']);
    expect(portDot(l, 'in', 'in')?.x).toBe(FRAME + SIDE_W / 2);
    expect(portDot(l, 'out', 'out')?.x).toBe(l.w - FRAME - SIDE_W / 2);
    expect(portDot(l, 'in', 'nope')).toBeUndefined();
  });

  it('the ARM strip fills the column: a taller window shows more connectors', () => {
    const small = layoutWindow(synth({ ui: { width: 200, height: 100 } }));
    const tall = layoutWindow(synth({ ui: { width: 200, height: 500 } }));
    const per = (l: typeof small) => l.groups.find((g) => g.kind === 'arm')?.arm?.perPage ?? 0;
    expect(per(tall)).toBeGreaterThan(per(small));
  });

  it('pages through 1..16, clamps the page, and sends hidden connectors to the pager', () => {
    const l0 = layoutWindow(synth({ ui: { width: 200, height: 100 } }));
    const g0 = l0.groups.find((g) => g.kind === 'arm');
    const per = g0?.arm?.perPage ?? 0;
    expect(g0?.dots[0]?.index).toBe(1);
    const l1 = layoutWindow(synth({ ui: { width: 200, height: 100 }, page: { in: 1 } }));
    expect(l1.groups.find((g) => g.kind === 'arm')?.dots[0]?.index).toBe(per + 1);
    const far = layoutWindow(synth({ ui: { width: 200, height: 100 }, page: { in: 99 } }));
    const gFar = far.groups.find((g) => g.kind === 'arm');
    expect(gFar?.arm?.page).toBe((gFar?.arm?.pages ?? 0) - 1);
    expect(gFar?.dots.at(-1)?.index).toBe(16);
    // Connector 16 on page 0 isn't shown: its cable ends at the pager.
    const pager = armDot(l0, 'in', 16);
    expect(pager?.y).toBe(g0?.arm?.pagerY);
    expect(armDot(l0, 'in', 1)).toEqual({ x: g0?.dots[0]?.x, y: g0?.dots[0]?.y });
    expect(armDot(l0, 'out', 1)).toBeUndefined();
  });

  it('a modulator: no UI, a parameter strip, ARM OUT only, modulation ports get no dots', () => {
    const l = layoutWindow({
      ins: [],
      outs: [modOut],
      armIn: true,
      armOut: true,
      paramRows: 3,
      footer: false,
    });
    expect(l.params?.h).toBe(3 * 24 + 8);
    expect(l.groups.map((g) => `${g.side}:${g.kind}`)).toEqual(['in:arm', 'out:arm']);
    expect(portDot(l, 'out', 'out')).toBeUndefined();
  });

  it('Master: audio in and Volume / Pan only; an empty plugin still has a minimum size', () => {
    const m = layoutWindow({
      ins: [{ id: 'in', label: 'in', kind: 'audio' }],
      outs: [],
      armIn: false,
      armOut: false,
      paramRows: 0,
      footer: true,
    });
    expect(m.groups.map((g) => `${g.side}:${g.kind}`)).toEqual(['in:audio']);
    expect(m.w).toBe(FRAME + SIDE_W + GAP + 220 + FRAME);
    const empty = layoutWindow({
      ins: [],
      outs: [],
      armIn: false,
      armOut: false,
      paramRows: 0,
      footer: false,
    });
    expect(empty.w).toBe(FRAME + CENTRE_MIN_W + FRAME);
  });

  it('hiding the UI shrinks the window (UI_INSET frame included when shown)', () => {
    const shown = layoutWindow(synth());
    const hidden = layoutWindow(synth({ ui: undefined }));
    expect(shown.w - hidden.w).toBe(260 + UI_INSET * 2 - 220);
    expect(hidden.h).toBeLessThan(shown.h);
  });
});
