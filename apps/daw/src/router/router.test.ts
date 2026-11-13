import type { PluginEvent, PluginInstance, PortHandle, PortInfo } from 'ivandaw-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Engine, LoadedNode } from '../contracts/engine';
import { createStubScheduler } from '../contracts/stubs';
import {
  FakeAudioContext,
  type FakeGain,
  type FakeNode,
  type FakeParam,
  reaches,
} from '../engine/testing/fakeAudio';
import { type CatalogEntry, manifestsFrom } from '../model/catalog';
import { emptyProject, parseProject } from '../model/project';
import { connect, disconnect, loadProject, removeNode, setNodeStatus } from '../store/actions';
import { defaultDeps, deps, project, provide } from '../store/store';
import { CABLE_DISCONNECT_MS, createRouter, type LiveRouter } from './router';

const GEN = 'gen';
const SYNTH = 'synth';
const MOD = 'mod';
const modOut: PortInfo = { id: 'out', label: 'out', kind: 'modulation', direction: 'out' };
const evOut: PortInfo & { kind: 'events' } = {
  id: 'out',
  label: 'out',
  kind: 'events',
  direction: 'out',
  accepts: ['midi'],
};
const evIn: PortInfo & { kind: 'events' } = {
  id: 'in',
  label: 'in',
  kind: 'events',
  direction: 'in',
  accepts: ['midi'],
};
const audioOut: PortInfo & { kind: 'audio' } = {
  id: 'out',
  label: 'out',
  kind: 'audio',
  direction: 'out',
  channels: 2,
  main: true,
};
const catalog: CatalogEntry[] = [
  { id: GEN, name: 'Gen', kind: 'midi', url: '', ports: [evOut] },
  { id: SYNTH, name: 'Synth', kind: 'instrument', url: '', ports: [evIn, audioOut] },
  { id: MOD, name: 'Mod', kind: 'modulator', url: '', ports: [modOut] },
];

interface Fake extends PluginInstance {
  got: PluginEvent[];
  emit(e: PluginEvent): void;
  throws: boolean;
}

let ctx: FakeAudioContext;
let master: FakeGain;
let loaded: Map<string, LoadedNode>;
let router: LiveRouter;
let detach: () => void;
let notices: string[];
let clock: number;

function fakeInstance(plugin: string): Fake {
  const listeners = new Set<(e: PluginEvent) => void>();
  const ports = new Map<string, PortHandle>();
  if (plugin === GEN) ports.set('out', { info: evOut });
  else if (plugin === MOD) ports.set('out', { info: modOut as PortInfo & { kind: 'modulation' } });
  else {
    ports.set('in', { info: evIn });
    ports.set('out', { info: audioOut, node: ctx.createGain() as unknown as AudioNode, index: 0 });
  }
  const inst: Fake = {
    got: [],
    throws: false,
    emit: (e) => {
      for (const l of listeners) l(e);
    },
    ports,
    latency: 0,
    tail: 0,
    parameters: () =>
      plugin === SYNTH
        ? [
            {
              id: 'level',
              label: 'Level',
              kind: 'float',
              min: 0,
              max: 1,
              default: 0.5,
              automatable: true,
            },
          ]
        : plugin === MOD
          ? [
              {
                id: 'out',
                label: 'Out',
                kind: 'float',
                min: 0,
                max: 1,
                default: 0.5,
                automatable: true,
              },
            ]
          : [],
    parameter: (id) => (plugin === MOD && id === 'out' ? 0.25 : 0),
    schedule(events) {
      if (inst.throws) throw new Error('kaboom');
      inst.got.push(...events);
    },
    listen(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    subscribe: () => () => {},
    getState: async () => ({ pluginId: plugin, pluginVersion: '1', data: {} }),
    setState: async () => {},
    mount: () => {},
    unmount: () => {},
    suspend: () => {},
    resume: () => {},
    dispose: () => {},
  };
  return inst;
}

/** Simulates the engine finishing a load: live node + strip, then status 'ready'. */
function ready(id: string): Fake {
  const node = project.value.nodes.find((n) => n.id === id);
  if (!node) throw new Error(id);
  const instance = fakeInstance(node.plugin);
  const out = instance.ports.get('out');
  let strip: LoadedNode['strip'];
  if (out && 'node' in out) {
    const input = ctx.createGain();
    const output = ctx.createStereoPanner();
    (out.node as unknown as FakeNode).connect(input);
    input.connect(output);
    strip = { input: input as unknown as GainNode, output: output as unknown as StereoPannerNode };
  }
  loaded.set(id, { instance, manifest: {} as LoadedNode['manifest'], strip });
  setNodeStatus(id, 'ready');
  return instance;
}

const fake = (id: string) => loaded.get(id)?.instance as Fake;
const stripOut = (id: string) => loaded.get(id)?.strip?.output as unknown as FakeNode;
/** The cable GainNodes the router created: gains that feed Master directly. */
const cableGains = () =>
  ctx.created.filter((n) => n.kind === 'gain' && n.outputs.has(master)) as FakeGain[];

beforeEach(() => {
  ctx = new FakeAudioContext();
  master = ctx.createGain();
  loaded = new Map();
  notices = [];
  clock = 0;
  deps.value = defaultDeps();
  provide({
    manifests: manifestsFrom({ plugins: catalog }),
    scheduler: createStubScheduler(() => clock),
  });
  loadProject(
    parseProject({
      ...emptyProject(),
      nodes: [
        { id: 'n1', plugin: GEN, x: 0, y: 0 },
        { id: 'n2', plugin: SYNTH, x: 0, y: 0 },
        { id: 'n3', plugin: SYNTH, x: 0, y: 0 },
        { id: 'm1', plugin: MOD, x: 0, y: 0 },
        { id: 'master', plugin: 'builtin.master', x: 0, y: 0 },
      ],
      cables: [
        { id: 'c1', from: { node: 'n1', port: 'out' }, to: { node: 'n2', port: 'in' } },
        { id: 'c2', from: { node: 'n2', port: 'out' }, to: { node: 'master', port: 'in' } },
      ],
    }),
  );
  const engine: Engine = {
    context: ctx.asContext(),
    master: master as unknown as AudioNode,
    unlock: async () => {},
    get: (id) => loaded.get(id),
    rms: () => 0,
    controlParam: (id, which) => {
      const s = loaded.get(id)?.strip;
      if (!s) return undefined;
      return { param: which === 'gain' ? s.input.gain : s.output.pan, scale: 1 };
    },
  };
  router = createRouter({ engine, onNotify: (node, msg) => notices.push(`${node}: ${msg}`) });
  provide({ router });
  detach = router.attach();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  detach();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('audio cables', () => {
  it('waits until both ends are ready, then wires strip → cable gain → Master with a 10 ms fade in', () => {
    expect(router.wiring.audio).toEqual([]);
    ready('n2');
    expect(router.wiring.audio.map((e) => e.id)).toEqual(['c2']);
    const [g] = cableGains();
    expect(g).toBeDefined();
    expect(stripOut('n2').outputs.has(g as FakeNode)).toBe(true);
    expect(g?.gain.value).toBe(0);
    expect(g?.gain.calls).toEqual([
      ['cancelAndHoldAtTime', 0],
      ['linearRampToValueAtTime', 1, 0.01],
    ]);
  });

  it('a removed cable fades out over 10 ms, then disconnects at 20 ms', () => {
    ready('n2');
    const [g] = cableGains();
    vi.useFakeTimers();
    ctx.currentTime = 5;
    disconnect('c2');
    expect(g?.gain.calls.slice(-2)).toEqual([
      ['cancelAndHoldAtTime', 5],
      ['linearRampToValueAtTime', 0, 5.01],
    ]);
    expect(reaches(stripOut('n2'), master)).toBe(true);
    vi.advanceTimersByTime(CABLE_DISCONNECT_MS);
    expect(reaches(stripOut('n2'), master)).toBe(false);
  });

  it('Master sums several cables', () => {
    ready('n2');
    ready('n3');
    expect(connect({ node: 'n3', port: 'out' }, { node: 'master', port: 'in' }).ok).toBe(true);
    expect(cableGains()).toHaveLength(2);
    expect(reaches(stripOut('n2'), master)).toBe(true);
    expect(reaches(stripOut('n3'), master)).toBe(true);
  });
});

describe('events', () => {
  it('forwards emitted events along cables with the target port, times unchanged', () => {
    const gen = ready('n1');
    const syn = ready('n2');
    const e: PluginEvent = { type: 'midi', time: 1.234, bytes: [0x90, 60, 100] };
    gen.emit(e);
    expect(syn.got).toEqual([{ ...e, port: 'in' }]);
  });

  it('one output feeds several inputs', () => {
    const gen = ready('n1');
    const a = ready('n2');
    const b = ready('n3');
    connect({ node: 'n1', port: 'out' }, { node: 'n3', port: 'in' });
    gen.emit({ type: 'midi', time: 2, bytes: [0x90, 61, 100] });
    expect(a.got).toHaveLength(1);
    expect(b.got).toHaveLength(1);
  });

  it('removing a notes cable sends CC 123 to the old target and stops forwarding', () => {
    const gen = ready('n1');
    const syn = ready('n2');
    ctx.currentTime = 3;
    disconnect('c1');
    expect(syn.got).toEqual([{ type: 'midi', time: 3, bytes: [0xb0, 123, 0] }]);
    gen.emit({ type: 'midi', time: 4, bytes: [0x90, 60, 100] });
    expect(syn.got).toHaveLength(1);
  });

  it('a node removed while playing: its targets get CC 123', () => {
    ready('n1');
    const syn = ready('n2');
    removeNode('n1');
    loaded.delete('n1');
    expect(syn.got.at(-1)).toMatchObject({ type: 'midi', bytes: [0xb0, 123, 0] });
  });

  it('a plugin that throws is caught, logged and shown once; routing continues', () => {
    const gen = ready('n1');
    const syn = ready('n2');
    const other = ready('n3');
    connect({ node: 'n1', port: 'out' }, { node: 'n3', port: 'in' });
    syn.throws = true;
    gen.emit({ type: 'midi', time: 1, bytes: [0x90, 60, 100] });
    gen.emit({ type: 'midi', time: 2, bytes: [0x80, 60, 0] });
    expect(notices).toEqual(['n2: schedule failed: kaboom']);
    expect(other.got).toHaveLength(2);
  });
});

describe('transport', () => {
  it('sends scheduler events to every ready node, cabled or not', async () => {
    const gen = ready('n1');
    const a = ready('n2');
    const b = ready('n3');
    await deps.value.scheduler.play();
    for (const f of [gen, a, b]) {
      expect(f.got.at(-1)).toMatchObject({ type: 'transport', state: { playing: true } });
    }
  });

  it('a node that becomes ready while playing gets the current anchor at now', async () => {
    ready('n1');
    await deps.value.scheduler.play(); // stub: anchor at clock 0, beat 0
    clock = 1;
    ctx.currentTime = 1; // 2 beats in at 120 BPM
    const late = ready('n3');
    expect(late.got).toEqual([
      { type: 'transport', time: 1, state: expect.objectContaining({ playing: true, beat: 2 }) },
    ]);
  });

  it('a node that is not ready gets nothing', async () => {
    const gen = ready('n1');
    await deps.value.scheduler.play();
    expect(gen.got).toHaveLength(1);
    expect(fake('n2')).toBeUndefined();
  });
});

describe('detach', () => {
  it('disconnects every cable and stops forwarding', () => {
    const gen = ready('n1');
    const syn = ready('n2');
    detach();
    expect(reaches(stripOut('n2'), master)).toBe(false);
    gen.emit({ type: 'midi', time: 1, bytes: [0x90, 60, 100] });
    expect(syn.got).toEqual([]);
    detach = () => {};
  });
});

// Keep FakeParam in the import list used for type clarity in assertions above.
export type { FakeParam };

describe('control cables (v1.1)', () => {
  const autos = (f: Fake) => f.got.filter((e) => e.type === 'automation');

  it('turns modulator values into binding automation on ctl:param:<id>', () => {
    const synth = ready('n2');
    const mod = ready('m1');
    const r = connect({ node: 'm1', port: 'out' }, { node: 'n2', port: 'ctl:param:level' });
    expect(r.ok).toBe(true);
    expect(router.wiring.control.map((e) => e.to.port)).toEqual(['ctl:param:level']);
    // On connect the target jumps to the source's current value.
    expect(autos(synth)).toEqual([
      { type: 'automation', time: 0, id: 'level', value: 0.25, source: 'binding' },
    ]);
    mod.emit({ type: 'automation', time: 1.5, id: 'out', value: 0.9 });
    expect(autos(synth).at(-1)).toEqual({
      type: 'automation',
      time: 1.5,
      id: 'level',
      value: 0.9,
      source: 'binding',
    });
  });

  it('glides the strip volume (0..1 → 0..1.5) and pan (0..1 → −1..1)', () => {
    ready('n2');
    const mod = ready('m1');
    connect({ node: 'm1', port: 'out' }, { node: 'n2', port: 'ctl:gain' });
    connect({ node: 'm1', port: 'out' }, { node: 'n3', port: 'ctl:pan' });
    ready('n3');
    const gain = loaded.get('n2')?.strip?.input.gain as unknown as FakeParam;
    const pan = loaded.get('n3')?.strip?.output.pan as unknown as FakeParam;
    ctx.currentTime = 2;
    mod.emit({ type: 'automation', time: 2.025, id: 'out', value: 1 });
    expect(gain.target).toBeCloseTo(1.5, 9);
    expect(pan.target).toBeCloseTo(1, 9);
    expect(gain.calls.at(-1)).toEqual(['setTargetAtTime', 1.5, 2.025, 0.01]);
    mod.emit({ type: 'automation', time: 2.05, id: 'out', value: 0 });
    expect(pan.target).toBeCloseTo(-1, 9);
  });

  it('removing the cable restores the stored value, or the default', () => {
    const synth = ready('n2');
    ready('m1');
    const r = connect({ node: 'm1', port: 'out' }, { node: 'n2', port: 'ctl:param:level' });
    const gainCable = connect({ node: 'm1', port: 'out' }, { node: 'n2', port: 'ctl:gain' });
    if (!r.ok || !gainCable.ok) throw new Error('connect');
    disconnect(r.id);
    expect(autos(synth).at(-1)).toMatchObject({ id: 'level', value: 0.5, source: 'host' });
    disconnect(gainCable.id);
    const gain = loaded.get('n2')?.strip?.input.gain as unknown as FakeParam;
    expect(gain.target).toBeCloseTo(1, 9);
  });

  it('does not send modulator values along notes cables, or notes along control cables', () => {
    const synth = ready('n2');
    const gen = ready('n1');
    const mod = ready('m1');
    connect({ node: 'm1', port: 'out' }, { node: 'n2', port: 'ctl:param:level' });
    const before = synth.got.length;
    gen.emit({ type: 'midi', time: 1, bytes: [0x90, 60, 100] });
    expect(synth.got.length).toBe(before + 1); // the c1 notes cable only
    mod.emit({ type: 'midi', time: 1, bytes: [0x90, 60, 100] });
    expect(synth.got.length).toBe(before + 1);
  });
});
