import { effect } from '@preact/signals-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Router } from '../contracts/router';
import { createStubScheduler } from '../contracts/stubs';
import { type CatalogEntry, manifestsFrom } from '../model/catalog';
import { emptyProject, MASTER_ID, type Project, parseProject } from '../model/project';
import {
  addNode,
  connect,
  disconnect,
  loadProject,
  moveNode,
  pause,
  play,
  removeNode,
  select,
  setBpm,
  setGain,
  setNodeStatus,
  setPan,
  setParam,
  stop,
} from './actions';
import {
  defaultDeps,
  deps,
  nodeErrors,
  nodeStatus,
  playing,
  project,
  provide,
  selection,
} from './store';

const SINE = 'com.ivandaw.base-sine-synth';
const GEN = 'com.ivandaw.note-gen';
const catalog: CatalogEntry[] = [
  {
    id: GEN,
    name: 'Note generator',
    kind: 'midi',
    url: '/gen.js',
    ports: [{ id: 'out', label: 'out', kind: 'events', direction: 'out', accepts: ['midi'] }],
  },
  {
    id: SINE,
    name: 'Base sine synth',
    kind: 'instrument',
    url: '/sine.js',
    ports: [
      { id: 'in', label: 'in', kind: 'events', direction: 'in', accepts: ['midi'] },
      { id: 'out', label: 'out', kind: 'audio', direction: 'out', channels: 2, main: true },
    ],
  },
];

const demo = (): Project =>
  parseProject({
    ...emptyProject(),
    nodes: [
      { id: 'n1', plugin: GEN, x: 80, y: 160 },
      { id: 'n2', plugin: SINE, x: 360, y: 160 },
      { id: 'master', plugin: 'builtin.master', x: 640, y: 160 },
    ],
    cables: [
      { id: 'c1', from: { node: 'n1', port: 'out' }, to: { node: 'n2', port: 'in' } },
      { id: 'c2', from: { node: 'n2', port: 'out' }, to: { node: 'master', port: 'in' } },
    ],
  });

let clock = 0;

beforeEach(() => {
  clock = 0;
  deps.value = defaultDeps();
  provide({
    manifests: manifestsFrom({ plugins: catalog }),
    scheduler: createStubScheduler(() => clock),
  });
  loadProject(demo());
});

const node = (id: string) => project.value.nodes.find((n) => n.id === id);

describe('loadProject', () => {
  it('replaces the project, clears selection, marks Master ready', () => {
    select({ node: 'n1' });
    loadProject(demo());
    expect(project.value.nodes).toHaveLength(3);
    expect(selection.value).toEqual({});
    expect(nodeStatus.value).toEqual({ master: 'ready' });
  });
});

describe('every action replaces the project instead of mutating it', () => {
  it('keeps the previous object intact', () => {
    const before = project.value;
    const snapshot = structuredClone(before);
    moveNode('n1', 1, 2);
    setGain('n1', 0.5);
    setPan('n1', 0.5);
    setParam('n2', 'level', 0.3);
    setBpm(90);
    addNode(SINE, 0, 0);
    connect({ node: 'n1', port: 'out' }, { node: 'n2', port: 'in' });
    disconnect('c2');
    removeNode('n1');
    expect(project.value).not.toBe(before);
    expect(before).toEqual(snapshot);
  });

  it('notifies subscribers once per change and not at all for a no-op', () => {
    const seen = vi.fn();
    const dispose = effect(() => {
      seen(project.value);
    });
    seen.mockClear();
    moveNode('n1', 10, 20);
    moveNode('n1', 10, 20);
    setGain('n1', 1);
    removeNode(MASTER_ID);
    removeNode('nope');
    disconnect('nope');
    expect(seen).toHaveBeenCalledTimes(1);
    dispose();
  });
});

describe('addNode', () => {
  it('adds a node with defaults and selects it', () => {
    const id = addNode(GEN, 100, 200);
    expect(node(id)).toEqual({
      id,
      plugin: GEN,
      x: 100,
      y: 200,
      gain: 1,
      pan: 0,
      bypass: false,
      params: {},
    });
    expect(selection.value).toEqual({ node: id });
  });

  it('cables a new instrument main out to Master', () => {
    const id = addNode(SINE, 0, 0);
    const added = project.value.cables.at(-1);
    expect(added?.from).toEqual({ node: id, port: 'out' });
    expect(added?.to).toEqual({ node: MASTER_ID, port: 'in' });
  });

  it('adds no cable for a non-instrument or an unknown plugin', () => {
    const before = project.value.cables.length;
    addNode(GEN, 0, 0);
    addNode('com.example.unknown', 0, 0);
    expect(project.value.cables).toHaveLength(before);
  });

  it('refuses a second Master', () => {
    expect(() => addNode('builtin.master', 0, 0)).toThrow();
  });

  it('never reuses an id', () => {
    const a = addNode(GEN, 0, 0);
    removeNode(a);
    const b = addNode(GEN, 0, 0);
    expect(b).not.toBe(a);
    // ...even after loading a project again, or one whose ids are higher than the counter.
    loadProject(demo());
    const c = addNode(GEN, 0, 0);
    expect([a, b]).not.toContain(c);
    loadProject(
      parseProject({ ...emptyProject(), nodes: [{ id: 'n99', plugin: GEN, x: 0, y: 0 }] }),
    );
    expect(addNode(GEN, 0, 0)).toBe('n100');
  });
});

describe('moveNode', () => {
  it('sets x and y', () => {
    moveNode('n2', 7, 8);
    expect(node('n2')).toMatchObject({ x: 7, y: 8 });
  });
});

describe('removeNode', () => {
  it('drops the node, its cables, its status and the selection on it', () => {
    setNodeStatus('n2', 'error', 'boom');
    select({ node: 'n2' });
    removeNode('n2');
    expect(node('n2')).toBeUndefined();
    expect(project.value.cables).toEqual([]);
    expect(nodeStatus.value.n2).toBeUndefined();
    expect(nodeErrors.value.n2).toBeUndefined();
    expect(selection.value).toEqual({});
  });

  it('clears a selected cable that went with the node', () => {
    select({ cable: 'c1' });
    removeNode('n1');
    expect(selection.value).toEqual({});
    expect(project.value.cables.map((c) => c.id)).toEqual(['c2']);
  });

  it('keeps an unrelated selection', () => {
    select({ cable: 'c2' });
    removeNode('n1');
    expect(selection.value).toEqual({ cable: 'c2' });
  });

  it('refuses Master', () => {
    removeNode(MASTER_ID);
    expect(node(MASTER_ID)).toBeDefined();
  });
});

describe('connect', () => {
  it('asks the router first and returns its refusal', () => {
    const validate = vi.fn<Router['validate']>(() => ({ ok: false, reason: 'cycle' }));
    provide({ router: { ...deps.value.router, validate } });
    const before = project.value;
    const r = connect({ node: 'n2', port: 'out' }, { node: 'n1', port: 'in' });
    expect(r).toEqual({ ok: false, reason: 'cycle' });
    expect(project.value).toBe(before);
    expect(validate).toHaveBeenCalledWith(
      before,
      deps.value.manifests,
      { node: 'n2', port: 'out' },
      { node: 'n1', port: 'in' },
    );
  });

  it('adds a cable with a new id', () => {
    disconnect('c1');
    const r = connect({ node: 'n1', port: 'out' }, { node: 'n2', port: 'in' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.id).not.toBe('c1');
    expect(project.value.cables.at(-1)).toEqual({
      id: r.id,
      from: { node: 'n1', port: 'out' },
      to: { node: 'n2', port: 'in' },
    });
  });

  it('replaces the cable on a taken input', () => {
    const gen2 = addNode(GEN, 0, 0);
    select({ cable: 'c1' });
    const r = connect({ node: gen2, port: 'out' }, { node: 'n2', port: 'in' });
    expect(r.ok).toBe(true);
    const into = project.value.cables.filter((c) => c.to.node === 'n2' && c.to.port === 'in');
    expect(into).toHaveLength(1);
    expect(into[0]?.from.node).toBe(gen2);
    expect(selection.value).toEqual({});
  });

  it('lets Master in sum several cables', () => {
    const sine2 = addNode(SINE, 0, 0); // auto-cabled to Master
    const toMaster = project.value.cables.filter((c) => c.to.node === MASTER_ID);
    expect(toMaster.map((c) => c.from.node)).toEqual(['n2', sine2]);
  });
});

describe('disconnect', () => {
  it('removes the cable and its selection', () => {
    select({ cable: 'c1' });
    disconnect('c1');
    expect(project.value.cables.map((c) => c.id)).toEqual(['c2']);
    expect(selection.value).toEqual({});
  });
});

describe('setGain / setPan / setParam', () => {
  it('clamps gain to 0..1.5', () => {
    setGain('n2', 2);
    expect(node('n2')?.gain).toBe(1.5);
    setGain('n2', -1);
    expect(node('n2')?.gain).toBe(0);
  });

  it('clamps pan to -1..1', () => {
    setPan('n2', -4);
    expect(node('n2')?.pan).toBe(-1);
    setPan('n2', 0.25);
    expect(node('n2')?.pan).toBe(0.25);
  });

  it('stores only the changed parameter, clamped to 0..1', () => {
    setParam('n2', 'level', 0.7);
    setParam('n2', 'other', 3);
    expect(node('n2')?.params).toEqual({ level: 0.7, other: 1 });
  });

  it('ignores NaN and unknown nodes', () => {
    const before = project.value;
    setGain('n2', Number.NaN);
    setPan('n2', Number.POSITIVE_INFINITY);
    setParam('n2', 'level', Number.NaN);
    setGain('nope', 1);
    expect(project.value).toBe(before);
  });
});

describe('transport', () => {
  it('setBpm clamps to 40..240, stores it and tells the scheduler', () => {
    setBpm(300);
    expect(project.value.transport.bpm).toBe(240);
    expect(deps.value.scheduler.state.value.bpm).toBe(240);
    setBpm(10);
    expect(project.value.transport.bpm).toBe(40);
    setBpm(Number.NaN);
    expect(project.value.transport.bpm).toBe(40);
  });

  it('play / pause / stop forward to the scheduler, and `playing` follows it', async () => {
    expect(playing.value).toBe(false);
    await play();
    expect(playing.value).toBe(true);
    clock = 1; // 2 beats at 120 BPM
    pause();
    expect(playing.value).toBe(false);
    expect(deps.value.scheduler.state.value.beat).toBe(2);
    await play();
    expect(deps.value.scheduler.state.value.beat).toBe(2);
    stop();
    expect(playing.value).toBe(false);
    expect(deps.value.scheduler.state.value.beat).toBe(0);
  });

  it('`playing` follows a scheduler provided later', async () => {
    const s = createStubScheduler();
    provide({ scheduler: s });
    await s.play();
    expect(playing.value).toBe(true);
  });
});

describe('select / setNodeStatus', () => {
  it('select replaces the selection', () => {
    select({ node: 'n1' });
    select({ cable: 'c1' });
    expect(selection.value).toEqual({ cable: 'c1' });
  });

  it('records status and the error message, and clears the message on recovery', () => {
    setNodeStatus('n1', 'loading');
    setNodeStatus('n2', 'error', 'plugin not found');
    expect(nodeStatus.value).toMatchObject({ n1: 'loading', n2: 'error' });
    expect(nodeErrors.value).toEqual({ n2: 'plugin not found' });
    setNodeStatus('n2', 'ready');
    expect(nodeErrors.value).toEqual({});
  });
});
