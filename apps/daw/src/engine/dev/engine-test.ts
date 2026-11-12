// Dev-only listening page for P3: /src/engine/dev/engine-test.html on the dev server.
// The router (P8) does not exist yet, so this page connects the strip to Master itself.

import { effect } from '@preact/signals-core';
import { noteOff, noteOn } from 'ivandaw-core';
import { parseProject } from '../../model/project';
import { addNode, loadProject, removeNode, setGain, setPan } from '../../store/actions';
import { nodeStatus, project } from '../../store/store';
import { createEngine } from '../engine';
import { TEST_TONE_ID, testToneFactory } from '../testing/testTone';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

loadProject(
  parseProject({
    format: 'ivandaw.project',
    version: 1,
    transport: { bpm: 120 },
    nodes: [
      { id: 'n1', plugin: TEST_TONE_ID, x: 0, y: 0 },
      { id: 'master', plugin: 'builtin.master', x: 0, y: 0 },
    ],
    cables: [],
  }),
);

const engine = createEngine({
  catalog: {
    plugins: [
      { id: TEST_TONE_ID, name: 'Test tone', kind: 'instrument', url: 'test-tone', ports: [] },
    ],
  },
  importModule: async () => ({ default: testToneFactory }),
});
engine.attach();
engine.installUnlock();

/** The id of the tone node currently in the project. */
const toneId = () => project.value.nodes.find((n) => n.plugin === TEST_TONE_ID)?.id;

// Stand-in for the router: connect each ready tone node's strip to Master once.
const wired = new Set<string>();
effect(() => {
  const status = nodeStatus.value;
  for (const [id, s] of Object.entries(status)) {
    const strip = engine.get(id)?.strip;
    if (s === 'ready' && strip && !wired.has(id)) {
      strip.output.connect(engine.master);
      wired.add(id);
    }
  }
  for (const id of wired) if (!(id in status)) wired.delete(id);
  $('status').textContent = JSON.stringify(status);
});

const send = (bytes: [number, number, number], at: number) => {
  const id = toneId();
  const n = id ? engine.get(id) : undefined;
  n?.instance.schedule([{ type: 'midi', time: at, bytes }]);
};

$('note').onclick = async () => {
  await engine.unlock();
  const t = engine.context.currentTime + 0.05;
  send(noteOn(60, 100), t);
  send(noteOff(60), t + 0.5);
};
$('hold').onclick = async () => {
  await engine.unlock();
  send(noteOn(60, 100), engine.context.currentTime + 0.02);
};
$('release').onclick = () => send(noteOff(60), engine.context.currentTime);

const slider = (input: string, out: string, apply: (v: number) => void) => {
  $<HTMLInputElement>(input).oninput = (e) => {
    const v = Number((e.target as HTMLInputElement).value);
    $(out).textContent = v.toFixed(2);
    apply(v);
  };
};
slider('gain', 'gainv', (v) => {
  const id = toneId();
  if (id) setGain(id, v);
});
slider('pan', 'panv', (v) => {
  const id = toneId();
  if (id) setPan(id, v);
});
slider('mgain', 'mgainv', (v) => setGain('master', v));

$('remove').onclick = () => {
  const id = toneId();
  if (id) removeNode(id);
};
$('add').onclick = () => {
  if (!toneId()) addNode(TEST_TONE_ID, 0, 0);
};

// Visual meter only; nothing musical is timed here.
const meter = () => {
  const rms = engine.rms();
  $('rms').textContent = rms.toFixed(4);
  $('meter').style.width = `${Math.min(100, rms * 400)}%`;
  requestAnimationFrame(meter);
};
requestAnimationFrame(meter);

// For automated checks.
Object.assign(window, { __engine: engine });
