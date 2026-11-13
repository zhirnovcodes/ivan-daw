// Dev-only page for P9: /src/panels/dev/panels-test.html on the dev server.
// Stub scheduler with a fake clock, fake manifests, a fake instance and a fake catalog. No audio.

import { effect } from '@preact/signals-core';
import type { ParameterInfo, PluginEvent, PluginInstance } from 'ivandaw-core';
import { createStubScheduler } from '../../contracts/stubs';
import { type Catalog, manifestsFrom } from '../../model/catalog';
import { fetchProject } from '../../model/project';
import { loadProject, select, setNodeStatus } from '../../store/actions';
import { project, provide, selection } from '../../store/store';
import { formatDb } from '../format';
import { mountAddMenu, mountNodePanel, mountTransportBar, setPanelServices } from '../index';

const plugins: Catalog['plugins'] = [
  {
    id: 'com.ivandaw.note-gen',
    name: 'Note generator',
    kind: 'midi',
    url: '',
    ports: [{ id: 'out', label: 'out', kind: 'events', direction: 'out', accepts: ['midi'] }],
  },
  {
    id: 'com.ivandaw.base-sine-synth',
    name: 'Base sine synth',
    kind: 'instrument',
    url: '',
    ports: [
      { id: 'in', label: 'in', kind: 'events', direction: 'in', accepts: ['midi'] },
      { id: 'out', label: 'out', kind: 'audio', direction: 'out', channels: 2, main: true },
    ],
  },
];
const catalog: Catalog = { plugins };

// A fake clock: seconds since the page loaded.
const t0 = performance.now();
const now = (): number => (performance.now() - t0) / 1000;
const scheduler = createStubScheduler(now);
provide({ manifests: manifestsFrom(catalog), scheduler });

// The stub scheduler only refreshes `beat` when its state changes; tick it so the readout runs.
const stubState = scheduler.state as unknown as { value: typeof scheduler.state.value };
setInterval(() => {
  const s = scheduler.anchor.value;
  if (!s.state.playing) return;
  const beat = s.state.beat + ((now() - s.time) * s.state.bpm) / 60;
  stubState.value = { ...s.state, beat };
}, 100);

const base = { automatable: true, default: 0 } as const;
const fakeParams: ParameterInfo[] = [
  {
    ...base,
    id: 'level',
    label: 'Level',
    kind: 'float',
    min: 0,
    max: 1.5,
    default: 1,
    format: formatDb,
  },
  {
    ...base,
    id: 'cutoff',
    label: 'Cutoff',
    kind: 'float',
    min: 20,
    max: 20000,
    default: 1000,
    unit: 'Hz',
    scale: 'log',
  },
  { ...base, id: 'octave', label: 'Octave', kind: 'int', min: -2, max: 2 },
  {
    ...base,
    id: 'wave',
    label: 'Wave',
    kind: 'choice',
    min: 0,
    max: 3,
    choices: ['sine', 'triangle', 'saw', 'square'],
  },
  { ...base, id: 'mute', label: 'Mute', kind: 'boolean', min: 0, max: 1 },
  { ...base, id: 'panic', label: 'Panic', kind: 'trigger', min: 0, max: 1 },
  {
    ...base,
    id: 'hidden',
    label: 'Not automatable',
    kind: 'float',
    min: 0,
    max: 1,
    automatable: false,
  },
];

const logEl = document.getElementById('log') as HTMLElement;
const lines: string[] = [];
const fakeInstance = {
  parameters: () => fakeParams,
  schedule: (events: PluginEvent[]) => {
    for (const e of events) {
      if (e.type !== 'automation') continue;
      lines.unshift(`t=${e.time.toFixed(3)}  ${e.id} = ${e.value.toFixed(3)}  (${e.source})`);
    }
    logEl.textContent = lines.slice(0, 12).join('\n');
  },
} as unknown as PluginInstance;

// Master and the synth have a live instance; the note generator is still "loading".
setPanelServices({
  instance: (id) => (id === 'n2' ? fakeInstance : undefined),
  now,
  catalog: () => Promise.resolve(catalog),
  canvasCenter: () => ({ x: 400, y: 300 }),
});

loadProject(await fetchProject('/projects/demo.json'));
setNodeStatus('n1', 'error', 'Demo error: this plugin failed to load');
setNodeStatus('n2', 'ready');

const el = (id: string): HTMLElement => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e;
};
mountTransportBar(el('bar'));
mountNodePanel(el('side'));
mountAddMenu(el('menu'));
el('center').textContent =
  'Add menu places new nodes at (400, 300), plus 24 px for each node already there.';

effect(() => {
  el('sel').textContent = JSON.stringify(selection.value);
  // The page has no canvas, so each node is a button that selects it.
  el('nodes').replaceChildren(
    ...project.value.nodes.map((n) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.node = n.id;
      b.textContent = `${n.id}  ${n.plugin}  (${n.x}, ${n.y})  gain ${n.gain}  pan ${n.pan}  params ${JSON.stringify(n.params)}`;
      b.style.cssText = `display:block;width:100%;text-align:left;font:inherit;border:0;padding:2px 4px;cursor:pointer;background:${selection.value.node === n.id ? '#ddd' : '#fff'}`;
      b.addEventListener('click', () => select({ node: n.id }));
      return b;
    }),
  );
  el('cables').textContent =
    project.value.cables
      .map((c) => `${c.id}  ${c.from.node}.${c.from.port} → ${c.to.node}.${c.to.port}`)
      .join('\n') || '(none)';
  el('transport').textContent = `bpm ${project.value.transport.bpm}`;
});
