// Dev-only listening page for P4: /src/scheduler/dev/scheduler-test.html on the dev server.
// Engine (no plugins) + scheduler with the debug click, wired to the store like the app will be.

import { effect } from '@preact/signals-core';
import { createEngine } from '../../engine/engine';
import { emptyProject } from '../../model/project';
import { loadProject, pause, play, setBpm, stop } from '../../store/actions';
import { playing, provide } from '../../store/store';
import { createScheduler } from '../scheduler';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

loadProject(emptyProject());
const engine = createEngine({ catalog: { plugins: [] } });
engine.attach();
engine.installUnlock();
const scheduler = createScheduler({ engine, click: true });
provide({ scheduler });
scheduler.attach();

const events: string[] = [];
scheduler.onEvent((e) => {
  const t = e.time.toFixed(3);
  const text =
    e.type === 'transport'
      ? `${t} transport ${e.state.playing ? 'play' : 'stop'} beat ${e.state.beat.toFixed(2)} @${e.state.bpm}`
      : e.type === 'tempo'
        ? `${t} tempo ${e.bpm}`
        : `${t} ${e.type}`;
  events.unshift(text);
  events.length = Math.min(events.length, 4);
  $('last').textContent = events.join(' | ');
});

const toggle = () => (playing.value ? pause() : void play());
$('play').onclick = toggle;
$('stop').onclick = () => stop();
effect(() => {
  $('play').textContent = playing.value ? 'Pause' : 'Play';
});

// Bar.beat readout, 1-based like a DAW.
effect(() => {
  const { beat, numerator } = scheduler.state.value;
  const whole = Math.floor(beat + 1e-9);
  $('beat').textContent = `${Math.floor(whole / numerator) + 1}.${(whole % numerator) + 1}`;
});

const bpmInput = $<HTMLInputElement>('bpm');
const commit = () => setBpm(Number(bpmInput.value));
bpmInput.onchange = commit;
for (const b of [60, 120, 180, 240]) {
  $(`b${b}`).onclick = () => {
    bpmInput.value = String(b);
    commit();
  };
}
effect(() => {
  if (document.activeElement !== bpmInput) bpmInput.value = String(scheduler.state.value.bpm);
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) {
    e.preventDefault();
    toggle();
  }
});

Object.assign(window, { __scheduler: scheduler, __engine: engine });
