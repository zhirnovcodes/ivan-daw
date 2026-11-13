// Dev-only listening page for P8: /src/router/dev/router-test.html on the dev server.
// Real engine, scheduler, router and canvas with the base sine synth from the catalog.
// The note generator (P7) is not merged yet, so the buttons play notes straight into the synths.

import { noteOff, noteOn } from 'ivandaw-core';
import { mountCanvas, showToast } from '../../canvas';
import { createEngine } from '../../engine/engine';
import { fetchCatalog, manifestsFrom } from '../../model/catalog';
import { parseProject } from '../../model/project';
import { createScheduler } from '../../scheduler/scheduler';
import * as actions from '../../store/actions';
import { loadProject } from '../../store/actions';
import { provide } from '../../store/store';
import { createRouter } from '../router';

const SYNTH = 'com.ivandaw.base-sine-synth';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const catalog = await fetchCatalog();
provide({ manifests: manifestsFrom(catalog) });
loadProject(
  parseProject({
    format: 'ivandaw.project',
    version: 1,
    transport: { bpm: 120 },
    nodes: [
      { id: 'n1', plugin: SYNTH, x: 80, y: 80 },
      { id: 'n2', plugin: SYNTH, x: 80, y: 260 },
      { id: 'master', plugin: 'builtin.master', x: 460, y: 160 },
    ],
    cables: [{ id: 'c1', from: { node: 'n1', port: 'out' }, to: { node: 'master', port: 'in' } }],
  }),
);

const engine = createEngine({
  catalog,
  onNotify: (node, _level, message) => showToast(`${node}: ${message}`),
});
engine.attach();
engine.installUnlock();
const scheduler = createScheduler({ engine });
const router = createRouter({ engine, onNotify: (node, msg) => showToast(`${node}: ${msg}`) });
provide({ scheduler, router });
scheduler.attach();
router.attach();
mountCanvas($('root'));

const send = (id: string, bytes: [number, number, number][]) => {
  const n = engine.get(id);
  const t = engine.context.currentTime + 0.02;
  n?.instance.schedule(bytes.map((b) => ({ type: 'midi', time: t, bytes: b })));
};
const CHORD = [60, 64, 67];
$('hold').onclick = async () => {
  await engine.unlock();
  send(
    'n1',
    CHORD.map((n) => noteOn(n, 100)),
  );
};
$('hold2').onclick = async () => {
  await engine.unlock();
  send('n2', [noteOn(72, 100)]);
};
$('release').onclick = () => {
  send(
    'n1',
    CHORD.map((n) => noteOff(n)),
  );
  send('n2', [noteOff(72)]);
};

const show = () => {
  const w = router.wiring;
  $('wiring').textContent =
    [...w.audio, ...w.events].map((e) => `${e.from.node}→${e.to.node}`).join(', ') || 'none';
  $('rms').textContent = engine.rms().toFixed(3);
  requestAnimationFrame(show);
};
requestAnimationFrame(show);

Object.assign(window, { __engine: engine, __router: router, __actions: actions });
