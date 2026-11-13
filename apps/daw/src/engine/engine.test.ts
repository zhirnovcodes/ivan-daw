import type {
  HostContext,
  PluginEvent,
  PluginFactory,
  PluginInstance,
  PortHandle,
  PortInfo,
} from 'ivandaw-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStubScheduler } from '../contracts/stubs';
import type { Catalog } from '../model/catalog';
import { emptyProject, parseProject } from '../model/project';
import { loadProject, play, removeNode, setGain, setPan } from '../store/actions';
import { defaultDeps, deps, nodeErrors, nodeStatus, provide } from '../store/store';
import { createEngine, type LiveEngine } from './engine';
import { MASTER_GAIN } from './master';
import { REMOVE_DISPOSE_MS } from './ramp';
import {
  FakeAnalyser,
  FakeAudioContext,
  FakeGain,
  type FakeNode,
  FakePanner,
  reaches,
} from './testing/fakeAudio';

const SYNTH = 'test.synth';
const GEN = 'test.gen';
const OLD = 'test.old-api';
const BROKEN = 'test.broken';

const outPort: PortInfo & { kind: 'audio' } = {
  id: 'out',
  label: 'out',
  kind: 'audio',
  direction: 'out',
  channels: 2,
  main: true,
};
const evOut: PortInfo & { kind: 'events' } = {
  id: 'out',
  label: 'out',
  kind: 'events',
  direction: 'out',
  accepts: ['midi'],
};

interface FakeInstance extends PluginInstance {
  scheduled: PluginEvent[];
  disposed: number;
  host: HostContext;
  outNode?: FakeGain;
}

const instances: FakeInstance[] = [];

function fakeFactory(
  id: string,
  withAudio: boolean,
  opts: { apiVersion?: number; fail?: string } = {},
) {
  let release: (() => void) | undefined;
  const gate = { hold: false, open: () => release?.() };
  const factory: PluginFactory = {
    manifest: {
      id,
      name: id,
      vendor: 'test',
      version: '1.0.0',
      apiVersion: (opts.apiVersion ?? 2) as 2,
      kind: withAudio ? 'instrument' : 'midi',
      ports: withAudio ? [outPort] : [evOut],
      ui: null,
      features: [],
    },
    async create(host) {
      if (gate.hold) await new Promise<void>((r) => (release = r));
      if (opts.fail) throw new Error(opts.fail);
      const ctx = host.audioContext as unknown as FakeAudioContext;
      const outNode = withAudio ? ctx.createGain() : undefined;
      const ports = new Map<string, PortHandle>();
      if (outNode)
        ports.set('out', { info: outPort, node: outNode as unknown as AudioNode, index: 0 });
      else ports.set('out', { info: evOut });
      const inst: FakeInstance = {
        host,
        outNode,
        scheduled: [],
        disposed: 0,
        ports,
        latency: 0,
        tail: 0,
        parameters: () => [],
        parameter: () => 0,
        schedule(events) {
          inst.scheduled.push(...events);
        },
        listen: () => () => {},
        subscribe: () => () => {},
        getState: async () => ({ pluginId: id, pluginVersion: '1', data: {} }),
        setState: async () => {},
        mount: () => {},
        unmount: () => {},
        suspend: () => {},
        resume: () => {},
        dispose() {
          inst.disposed++;
        },
      };
      instances.push(inst);
      return inst;
    },
  };
  return { factory, gate };
}

const synth = fakeFactory(SYNTH, true);
const gen = fakeFactory(GEN, false);
const old = fakeFactory(OLD, true, { apiVersion: 1 });
const broken = fakeFactory(BROKEN, true, { fail: 'worklet missing' });
const modules: Record<string, unknown> = {
  '/synth.js': { default: synth.factory },
  '/gen.js': { default: gen.factory },
  '/old.js': { default: old.factory },
  '/broken.js': { default: broken.factory },
  '/junk.js': { default: 42 },
};
const entry = (id: string, url: string) => ({
  id,
  name: id,
  kind: 'instrument' as const,
  url,
  ports: [],
});
const catalog: Catalog = {
  plugins: [
    entry(SYNTH, '/synth.js'),
    entry(GEN, '/gen.js'),
    entry(OLD, '/old.js'),
    entry(BROKEN, '/broken.js'),
    entry('test.junk', '/junk.js'),
  ],
};

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

let ctx: FakeAudioContext;
let engine: LiveEngine;
let detach: () => void;
let notices: string[];

function start(
  nodes: {
    id: string;
    plugin: string;
    gain?: number;
    pan?: number;
    params?: Record<string, number>;
  }[],
) {
  loadProject(
    parseProject({
      ...emptyProject(),
      nodes: [
        ...nodes.map((n) => ({ x: 0, y: 0, ...n })),
        { id: 'master', plugin: 'builtin.master', x: 0, y: 0 },
      ],
    }),
  );
  ctx = new FakeAudioContext();
  notices = [];
  engine = createEngine({
    catalog,
    createContext: () => ctx.asContext(),
    importModule: async (url) => modules[url],
    onNotify: (node, level, msg) => notices.push(`${node} ${level} ${msg}`),
  });
  detach = engine.attach();
}

const node = (n: AudioNode | undefined) => n as unknown as FakeNode;
const live = (id: string) => {
  const n = engine.get(id);
  if (!n) throw new Error(`${id} is not loaded`);
  return n;
};
const stripOf = (id: string) => {
  const s = live(id).strip;
  if (!s) throw new Error(`${id} has no strip`);
  return s;
};
const analyser = () => ctx.created.find((n) => n instanceof FakeAnalyser) as FakeAnalyser;

beforeEach(() => {
  instances.length = 0;
  deps.value = defaultDeps();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  detach?.();
  vi.useRealTimers();
  vi.restoreAllMocks();
  synth.gate.hold = false;
});

describe('Master', () => {
  it('routes in → master gain 0.8 → master pan → analyser → speakers', () => {
    start([]);
    expect(reaches(node(engine.master), ctx.destination)).toBe(true);
    const gains = ctx.created.filter((n) => n instanceof FakeGain) as FakeGain[];
    const out = gains.find((g) => g.gain.value === MASTER_GAIN);
    expect(out).toBeDefined();
    expect(node(engine.master).outputs.has(out as FakeNode)).toBe(true);
    const pan = [...(out?.outputs ?? [])].find((n) => n instanceof FakePanner) as FakePanner;
    expect(pan).toBeDefined();
    expect(pan.outputs.has(analyser())).toBe(true);
    expect(nodeStatus.value.master).toBe('ready');
  });

  it("follows the Master node's volume: 0.8 × gain, glided", () => {
    start([]);
    const out = ctx.created.find(
      (n) => n instanceof FakeGain && n.gain.value === MASTER_GAIN,
    ) as FakeGain;
    setGain('master', 1.5);
    expect(out.gain.target).toBeCloseTo(1.2, 9);
    expect(out.gain.calls.at(-1)?.[0]).toBe('setTargetAtTime');
  });

  it("follows the Master node's pan, glided", () => {
    start([]);
    const pan = ctx.created.find((n) => n instanceof FakePanner) as FakePanner;
    setPan('master', -0.5);
    expect(pan.pan.target).toBeCloseTo(-0.5, 9);
    expect(pan.pan.calls.at(-1)?.[0]).toBe('setTargetAtTime');
  });

  it('reports RMS from the analyser', () => {
    start([]);
    expect(engine.rms()).toBe(0);
    analyser().level = 0.5;
    expect(engine.rms()).toBeCloseTo(0.5, 6);
  });
});

describe('loading', () => {
  it('loads each node: loading → ready, with a strip after the main audio out', async () => {
    start([
      { id: 'n1', plugin: GEN },
      { id: 'n2', plugin: SYNTH, gain: 0.5, pan: -0.25 },
    ]);
    expect(nodeStatus.value).toMatchObject({ n1: 'loading', n2: 'loading' });
    await flush();
    expect(nodeStatus.value).toMatchObject({ n1: 'ready', n2: 'ready', master: 'ready' });

    const n2 = live('n2');
    expect(n2.manifest.id).toBe(SYNTH);
    const strip = stripOf('n2');
    expect(strip).toBeDefined();
    const inst = n2.instance as FakeInstance;
    expect(reaches(inst.outNode as FakeNode, node(strip.output))).toBe(true);
    expect((strip.input.gain as unknown as { value: number }).value).toBe(0.5);
    expect((strip.output.pan as unknown as { value: number }).value).toBe(-0.25);
    // The router connects strips to Master; the engine does not.
    expect(reaches(node(strip.output), node(engine.master))).toBe(false);

    expect(live('n1').strip).toBeUndefined();
    expect(engine.get('master')).toBeUndefined();
  });

  it('gives the plugin a HostContext with its slot id, API 2 and the shared context', async () => {
    start([{ id: 'n2', plugin: SYNTH }]);
    await flush();
    const host = (live('n2').instance as FakeInstance).host;
    expect(host.slotId).toBe('n2');
    expect(host.apiVersion).toBe(2);
    expect(host.audioContext).toBe(engine.context);
    expect(host.assetUrl('worklet.js')).toBe('http://localhost/worklet.js');
    host.notify('warning', 'low on voices');
    expect(notices).toContain('n2 warning low on voices');
  });

  it('host.transport() returns the beat at the moment of the call', async () => {
    provide({ scheduler: createStubScheduler(() => ctx.currentTime) });
    start([{ id: 'n2', plugin: SYNTH }]);
    await flush();
    const host = (live('n2').instance as FakeInstance).host;
    expect(host.transport()).toMatchObject({ playing: false, beat: 0 });
    await play();
    ctx.currentTime = 1.5; // 3 beats at 120 BPM
    expect(host.transport()).toMatchObject({ playing: true, beat: 3, bpm: 120 });
  });

  it('sends stored params as automation events on load', async () => {
    ctx = new FakeAudioContext();
    start([{ id: 'n2', plugin: SYNTH, params: { level: 0.3, cutoff: 0.9 } }]);
    await flush();
    const inst = live('n2').instance as FakeInstance;
    expect(inst.scheduled).toEqual([
      { type: 'automation', time: 0, id: 'level', value: 0.3, source: 'host' },
      { type: 'automation', time: 0, id: 'cutoff', value: 0.9, source: 'host' },
    ]);
  });

  it.each([
    ['unknown plugin', 'test.nope', 'plugin not found'],
    ['apiVersion 1', OLD, 'unsupported plugin API'],
    ['create rejects', BROKEN, 'failed to load: worklet missing'],
    ['no factory export', 'test.junk', 'not a plugin module (no default PluginFactory)'],
  ])('marks the node red on %s, keeps it in the project', async (_case, plugin, message) => {
    start([
      { id: 'n1', plugin },
      { id: 'n2', plugin: SYNTH },
    ]);
    await flush();
    expect(nodeStatus.value.n1).toBe('error');
    expect(nodeErrors.value.n1).toBe(message);
    expect(notices).toContain(`n1 error ${message}`);
    expect(engine.get('n1')).toBeUndefined();
    // The rest of the graph is unaffected.
    expect(nodeStatus.value.n2).toBe('ready');
  });
});

describe('strip changes', () => {
  it('glides volume and pan with setTargetAtTime(v, now, 0.01)', async () => {
    start([{ id: 'n2', plugin: SYNTH }]);
    await flush();
    ctx.currentTime = 2;
    setGain('n2', 1.2);
    setPan('n2', 0.5);
    const strip = stripOf('n2');
    const gain = strip.input.gain as unknown as FakeGain['gain'];
    const pan = strip.output.pan as unknown as FakeGain['gain'];
    expect(gain.calls.slice(-2)).toEqual([
      ['cancelAndHoldAtTime', 2],
      ['setTargetAtTime', 1.2, 2, 0.01],
    ]);
    expect(pan.calls.at(-1)).toEqual(['setTargetAtTime', 0.5, 2, 0.01]);
  });

  it('uses the latest volume if it changed while the plugin loaded', async () => {
    start([{ id: 'n2', plugin: SYNTH }]);
    setGain('n2', 0.2);
    await flush();
    expect((stripOf('n2').input.gain as unknown as { value: number }).value).toBe(0.2);
  });
});

describe('removal', () => {
  it('sends CC 123, fades the strip over 10 ms, then disconnects and disposes at 20 ms', async () => {
    start([{ id: 'n2', plugin: SYNTH }]);
    await flush();
    const n2 = live('n2');
    const inst = n2.instance as FakeInstance;
    const strip = stripOf('n2');
    strip.output.connect(engine.master); // what the router would do
    vi.useFakeTimers();
    ctx.currentTime = 3;
    removeNode('n2');

    expect(engine.get('n2')).toBeUndefined();
    expect(inst.scheduled.at(-1)).toEqual({ type: 'midi', time: 3, bytes: [0xb0, 123, 0] });
    const gain = strip.input.gain as unknown as FakeGain['gain'];
    expect(gain.calls.slice(-2)).toEqual([
      ['cancelAndHoldAtTime', 3],
      ['linearRampToValueAtTime', 0, 3.01],
    ]);
    expect(inst.disposed).toBe(0);

    vi.advanceTimersByTime(REMOVE_DISPOSE_MS);
    expect(inst.disposed).toBe(1);
    expect(node(strip.output).outputs.size).toBe(0);
    expect(inst.outNode?.outputs.size).toBe(0);
  });

  it('disposes a node removed while it was still loading, without marking it', async () => {
    synth.gate.hold = true;
    start([{ id: 'n2', plugin: SYNTH }]);
    await flush();
    removeNode('n2');
    synth.gate.open();
    await flush();
    expect(instances).toHaveLength(1);
    expect(instances[0]?.disposed).toBe(1);
    expect(engine.get('n2')).toBeUndefined();
    expect(nodeStatus.value.n2).toBeUndefined();
  });

  it('close() disposes everything and closes the context', async () => {
    start([{ id: 'n2', plugin: SYNTH }]);
    await flush();
    const inst = live('n2').instance as FakeInstance;
    await engine.close();
    expect(inst.disposed).toBe(1);
    expect(ctx.state).toBe('closed');
  });
});

describe('unlock', () => {
  it('resumes the suspended context', async () => {
    start([]);
    expect(engine.context.state).toBe('suspended');
    await engine.unlock();
    expect(engine.context.state).toBe('running');
  });

  it('unlocks on the first pointerdown or keydown, once', async () => {
    start([]);
    const target = new EventTarget();
    const unlock = vi.spyOn(engine, 'unlock');
    engine.installUnlock(target);
    target.dispatchEvent(new Event('keydown'));
    target.dispatchEvent(new Event('pointerdown'));
    await flush();
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(ctx.state).toBe('running');
  });
});
