import { describe, expect, it } from 'vitest';
import { type CatalogEntry, manifestsFrom } from '../model/catalog';
import { emptyProject, type Project, parseProject } from '../model/project';
import { diffWiring, EMPTY_WIRING, eventTable, plan } from './plan';
import { validate } from './validate';

const GEN = 'gen';
const SYNTH = 'synth';
const FX = 'fx';
const AUTO = 'auto-only';
const LFO = 'lfo';
const HOLD = 'hold';
const ARP = 'arp';
const catalog: CatalogEntry[] = [
  {
    id: HOLD,
    name: 'Note hold',
    kind: 'midi',
    url: '',
    ports: [{ id: 'out', label: 'out', kind: 'events', direction: 'out', accepts: ['midi'] }],
  },
  {
    id: ARP,
    name: 'Arp',
    kind: 'midi',
    url: '',
    ports: [
      {
        id: 'in',
        label: 'in',
        kind: 'events',
        direction: 'in',
        accepts: ['midi', 'transport'],
      },
      { id: 'out', label: 'out', kind: 'events', direction: 'out', accepts: ['midi'] },
    ],
  },
  {
    id: GEN,
    name: 'Gen',
    kind: 'midi',
    url: '',
    ports: [
      { id: 'out', label: 'out', kind: 'events', direction: 'out', accepts: ['midi'] },
      { id: 'in', label: 'in', kind: 'events', direction: 'in', accepts: ['midi'] },
    ],
  },
  {
    id: SYNTH,
    name: 'Synth',
    kind: 'instrument',
    url: '',
    ports: [
      { id: 'in', label: 'in', kind: 'events', direction: 'in', accepts: ['midi', 'automation'] },
      { id: 'out', label: 'out', kind: 'audio', direction: 'out', channels: 2, main: true },
    ],
  },
  {
    id: FX,
    name: 'Fx',
    kind: 'effect',
    url: '',
    ports: [
      { id: 'in', label: 'in', kind: 'audio', direction: 'in', channels: 2, main: true },
      { id: 'out', label: 'out', kind: 'audio', direction: 'out', channels: 2, main: true },
    ],
  },
  {
    id: AUTO,
    name: 'Auto',
    kind: 'utility',
    url: '',
    ports: [{ id: 'in', label: 'in', kind: 'events', direction: 'in', accepts: ['automation'] }],
  },
  {
    id: LFO,
    name: 'LFO',
    kind: 'modulator',
    url: '',
    ports: [{ id: 'out', label: 'out', kind: 'modulation', direction: 'out' }],
  },
];
const manifests = manifestsFrom({ plugins: catalog });

const project = (cables: [string, string, string, string][] = []): Project =>
  parseProject({
    ...emptyProject(),
    nodes: [
      { id: 'g1', plugin: GEN, x: 0, y: 0 },
      { id: 'g2', plugin: GEN, x: 0, y: 0 },
      { id: 's1', plugin: SYNTH, x: 0, y: 0 },
      { id: 's2', plugin: SYNTH, x: 0, y: 0 },
      { id: 'f1', plugin: FX, x: 0, y: 0 },
      { id: 'f2', plugin: FX, x: 0, y: 0 },
      { id: 'a1', plugin: AUTO, x: 0, y: 0 },
      { id: 'x1', plugin: 'not.in.catalog', x: 0, y: 0 },
      { id: 'master', plugin: 'builtin.master', x: 0, y: 0 },
    ],
    cables: cables.map(([fn, fp, tn, tp], i) => ({
      id: `c${i + 1}`,
      from: { node: fn, port: fp },
      to: { node: tn, port: tp },
    })),
  });

const v = (p: Project, fn: string, fp: string, tn: string, tp: string) =>
  validate(p, manifests, { node: fn, port: fp }, { node: tn, port: tp });

describe('validate', () => {
  it('accepts the demo wiring', () => {
    const p = project();
    expect(v(p, 'g1', 'out', 's1', 'in')).toEqual({ ok: true });
    expect(v(p, 's1', 'out', 'master', 'in')).toEqual({ ok: true });
  });

  it('1 self', () => {
    expect(v(project(), 'f1', 'out', 'f1', 'in')).toEqual({ ok: false, reason: 'self' });
  });

  it('2 direction', () => {
    const p = project();
    expect(v(p, 's1', 'in', 'g1', 'in')).toEqual({ ok: false, reason: 'direction' });
    expect(v(p, 'g1', 'out', 's1', 'out')).toEqual({ ok: false, reason: 'direction' });
    expect(v(p, 'master', 'in', 'f1', 'in')).toEqual({ ok: false, reason: 'direction' });
  });

  it('3 kind: audio to events, events with no shared type, unknown node or port', () => {
    const p = project();
    expect(v(p, 's1', 'out', 'g2', 'in')).toEqual({ ok: false, reason: 'kind' });
    expect(v(p, 'g1', 'out', 'f1', 'in')).toEqual({ ok: false, reason: 'kind' });
    expect(v(p, 'g1', 'out', 'a1', 'in')).toEqual({ ok: false, reason: 'kind' });
    expect(v(p, 'g1', 'out', 'x1', 'in')).toEqual({ ok: false, reason: 'kind' });
    expect(v(p, 'g1', 'nope', 's1', 'in')).toEqual({ ok: false, reason: 'kind' });
    expect(v(p, 'zz', 'out', 's1', 'in')).toEqual({ ok: false, reason: 'kind' });
  });

  it('4 duplicate', () => {
    const p = project([['s1', 'out', 'master', 'in']]);
    expect(v(p, 's1', 'out', 'master', 'in')).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('5 cycle, through audio and events cables together', () => {
    const p = project([
      ['f1', 'out', 'f2', 'in'],
      ['g1', 'out', 'g2', 'in'],
    ]);
    expect(v(p, 'f2', 'out', 'f1', 'in')).toEqual({ ok: false, reason: 'cycle' });
    expect(v(p, 'g2', 'out', 'g1', 'in')).toEqual({ ok: false, reason: 'cycle' });
    // A longer loop: f1 → f2 → master is fine; f2 → f1 closes it.
    const q = project([
      ['f1', 'out', 'f2', 'in'],
      ['f2', 'out', 'master', 'in'],
    ]);
    expect(v(q, 'f2', 'out', 'f1', 'in')).toEqual({ ok: false, reason: 'cycle' });
  });

  it('a cable that will replace the only path back is not a cycle', () => {
    // f1 → f2 exists. A new cable into f2's `in` replaces it, so only the new path counts.
    const p = project([['f1', 'out', 'f2', 'in']]);
    expect(v(p, 's1', 'out', 'f2', 'in')).toEqual({ ok: true });
  });

  it('checks the rules in order: the first failure wins', () => {
    const p = project([['s1', 'out', 'master', 'in']]);
    // Self and also wrong direction → self.
    expect(v(p, 's1', 'in', 's1', 'out')).toEqual({ ok: false, reason: 'self' });
    // Wrong direction and also wrong kind → direction.
    expect(v(p, 'g1', 'in', 's1', 'out')).toEqual({ ok: false, reason: 'direction' });
  });
});

describe('MIDI → MIDI chains', () => {
  const chain = (cables: [string, string, string, string][] = []): Project =>
    parseProject({
      ...emptyProject(),
      nodes: [
        { id: 'h1', plugin: HOLD, x: 0, y: 0 },
        { id: 'arpA', plugin: ARP, x: 0, y: 0 },
        { id: 'arpB', plugin: ARP, x: 0, y: 0 },
        { id: 's1', plugin: SYNTH, x: 0, y: 0 },
        ...emptyProject().nodes,
      ],
      cables: cables.map(([fn, fp, tn, tp], i) => ({
        id: `c${i + 1}`,
        from: { node: fn, port: fp },
        to: { node: tn, port: tp },
      })),
    });

  it('Note hold → arp → synth is allowed', () => {
    const p = chain();
    expect(v(p, 'h1', 'out', 'arpA', 'in')).toEqual({ ok: true });
    const q = chain([['h1', 'out', 'arpA', 'in']]);
    expect(v(q, 'arpA', 'out', 's1', 'in')).toEqual({ ok: true });
  });

  it('arp → Note hold is refused: Note hold has no input', () => {
    expect(v(chain(), 'arpA', 'out', 'h1', 'in')).toEqual({ ok: false, reason: 'kind' });
  });

  it('arp A → arp B → arp A is refused as a cycle', () => {
    const p = chain([['arpA', 'out', 'arpB', 'in']]);
    expect(v(p, 'arpB', 'out', 'arpA', 'in')).toEqual({ ok: false, reason: 'cycle' });
  });

  it('plans the chain as two events cables', () => {
    const p = chain([
      ['h1', 'out', 'arpA', 'in'],
      ['arpA', 'out', 's1', 'in'],
      ['s1', 'out', 'master', 'in'],
    ]);
    const w = plan(p, manifests, { h1: 'ready', arpA: 'ready', s1: 'ready', master: 'ready' });
    expect(w.events.map((e) => e.id)).toEqual(['c1', 'c2']);
    expect(eventTable(w).get('arpA:out')).toEqual([{ node: 's1', port: 'in' }]);
  });
});

describe('plan', () => {
  const p = project([
    ['g1', 'out', 's1', 'in'],
    ['s1', 'out', 'master', 'in'],
    ['s2', 'out', 'master', 'in'],
  ]);
  const all = { g1: 'ready', s1: 'ready', s2: 'ready', master: 'ready' };

  it('splits ready cables into audio and events', () => {
    const w = plan(p, manifests, all);
    expect(w.events.map((e) => e.id)).toEqual(['c1']);
    expect(w.audio.map((e) => e.id)).toEqual(['c2', 'c3']);
  });

  it('skips cables touching a node that is loading or broken', () => {
    const w = plan(p, manifests, { ...all, s2: 'loading', g1: 'error' });
    expect(w.events).toEqual([]);
    expect(w.audio.map((e) => e.id)).toEqual(['c2']);
  });

  it('builds the event table and diffs plans', () => {
    const before = plan(p, manifests, { ...all, s2: 'loading' });
    const after = plan(p, manifests, { ...all, g1: 'loading' });
    expect(diffWiring(before, after)).toEqual({
      audio: { connect: [after.audio[1]], disconnect: [] },
      events: { connect: [], disconnect: [before.events[0]] },
      control: { connect: [], disconnect: [] },
    });
    expect(eventTable(before).get('g1:out')).toEqual([{ node: 's1', port: 'in' }]);
    expect(diffWiring(EMPTY_WIRING, EMPTY_WIRING)).toEqual({
      audio: { connect: [], disconnect: [] },
      events: { connect: [], disconnect: [] },
      control: { connect: [], disconnect: [] },
    });
  });
});

describe('control inputs (v1.1)', () => {
  const p = (cables: [string, string, string, string][] = []): Project =>
    parseProject({
      ...emptyProject(),
      nodes: [
        { id: 'l1', plugin: LFO, x: 0, y: 0 },
        { id: 'l2', plugin: LFO, x: 0, y: 0 },
        { id: 'g1', plugin: GEN, x: 0, y: 0 },
        { id: 's1', plugin: SYNTH, x: 0, y: 0 },
        ...emptyProject().nodes,
      ],
      cables: cables.map(([a, b, c, d], i) => ({
        id: `c${i + 1}`,
        from: { node: a, port: b },
        to: { node: c, port: d },
      })),
    });
  const v = (pr: Project, a: string, b: string, c: string, d: string) =>
    validate(pr, manifests, { node: a, port: b }, { node: c, port: d });

  it('accepts modulation into ctl:gain, ctl:pan and ctl:param:<id>', () => {
    expect(v(p(), 'l1', 'out', 's1', 'ctl:gain')).toEqual({ ok: true });
    expect(v(p(), 'l1', 'out', 's1', 'ctl:pan')).toEqual({ ok: true });
    expect(v(p(), 'l1', 'out', 's1', 'ctl:param:level')).toEqual({ ok: true });
    expect(v(p(), 'l1', 'out', 'master', 'ctl:gain')).toEqual({ ok: true });
    expect(v(p(), 'l1', 'out', 'g1', 'ctl:param:rate')).toEqual({ ok: true });
  });

  it('has no volume / pan on a modulator, and no parameters on Master', () => {
    // v1.2: MIDI plugins have Volume / Pan (velocity and MIDI pan).
    expect(v(p(), 'l1', 'out', 'g1', 'ctl:gain')).toEqual({ ok: true });
    expect(v(p(), 'l1', 'out', 'l2', 'ctl:gain')).toEqual({ ok: false, reason: 'kind' });
    expect(v(p(), 'l1', 'out', 'master', 'ctl:param:x')).toEqual({ ok: false, reason: 'kind' });
    expect(v(p(), 'l1', 'out', 's1', 'ctl:bogus')).toEqual({ ok: false, reason: 'kind' });
  });

  it('refuses notes or audio into a control input, and control into notes', () => {
    expect(v(p(), 'g1', 'out', 's1', 'ctl:gain')).toEqual({ ok: false, reason: 'kind' });
    expect(v(p(), 's1', 'out', 'l2', 'ctl:param:x')).toEqual({ ok: false, reason: 'kind' });
    expect(v(p(), 'l1', 'out', 's1', 'in')).toEqual({ ok: false, reason: 'kind' });
  });

  it('refuses a control input as a source', () => {
    expect(v(p(), 's1', 'ctl:gain', 'l1', 'ctl:param:x')).toEqual({
      ok: false,
      reason: 'direction',
    });
  });

  it('plans valid ARM links as control edges with their Min / Max (v1.2)', () => {
    const pr: Project = {
      ...p([['s1', 'out', 'master', 'in']]),
      arms: [
        {
          id: 'a1',
          from: { node: 'l1', index: 1 },
          to: { node: 's1', index: 1 },
          source: 'out',
          target: 'ctl:pan',
          min: 20,
          max: 80,
        },
        // invalid: no In picked yet
        {
          id: 'a2',
          from: { node: 'l1', index: 2 },
          to: { node: 's1', index: 2 },
          min: 0,
          max: 100,
        },
        // a notes port is not an ARM source
        {
          id: 'a3',
          from: { node: 'g1', index: 1 },
          to: { node: 's1', index: 3 },
          source: 'out',
          target: 'ctl:gain',
          min: 0,
          max: 100,
        },
      ],
    };
    const w = plan(pr, manifests, { l1: 'ready', s1: 'ready', g1: 'ready', master: 'ready' });
    expect(w.control).toEqual([
      {
        id: 'a1',
        from: { node: 'l1', port: 'out' },
        to: { node: 's1', port: 'ctl:pan' },
        range: { min: 20, max: 80 },
      },
    ]);
    expect(w.audio.map((e) => e.id)).toEqual(['c1']);
    expect(eventTable(w, 'control').get('l1:out')).toEqual([
      { node: 's1', port: 'ctl:pan', range: { min: 20, max: 80 } },
    ]);
    expect(eventTable(w).get('l1:out')).toBeUndefined();
    // A Min / Max change is a new edge: the router re-primes it.
    const moved = { ...pr, arms: pr.arms?.map((a) => (a.id === 'a1' ? { ...a, max: 90 } : a)) };
    const w2 = plan(moved, manifests, { l1: 'ready', s1: 'ready', g1: 'ready', master: 'ready' });
    expect(diffWiring(w, w2).control.connect.map((e) => e.range)).toEqual([{ min: 20, max: 90 }]);
  });
});
