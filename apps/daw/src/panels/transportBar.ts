// The transport bar: Play / Pause, Stop, BPM, beat readout, + Add. Tech design: "Panels".

import { effect } from '@preact/signals-core';
import type { MountUi } from '../contracts/ui';
import { pause, play, setBpm, stop } from '../store/actions';
import { deps, mode, playing, project } from '../store/store';
import { addMenuOpen } from './addMenu';
import { parseBpm, stepBpm } from './bpm';
import { ensureStyles, h } from './dom';
import { formatBeat } from './format';
import { shouldTogglePlay } from './keys';

export const mountTransportBar: MountUi = (root) => {
  ensureStyles();
  const bar = h('div', 'ivp-bar');
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Transport');

  const playBtn = h('button', 'ivp-play', 'Play');
  playBtn.type = 'button';
  const stopBtn = h('button', 'ivp-stop', 'Stop');
  stopBtn.type = 'button';

  const bpmWrap = h('label', 'ivp-bpm');
  const bpmInput = h('input', '');
  bpmInput.type = 'number';
  bpmInput.min = '40';
  bpmInput.max = '240';
  bpmInput.step = '1';
  bpmInput.setAttribute('aria-label', 'BPM');
  bpmWrap.append('BPM', bpmInput);

  const beat = h('span', 'ivp-beat');
  beat.setAttribute('aria-label', 'Position, bar.beat');
  const addBtn = h('button', '', '+ Add');
  addBtn.type = 'button';
  addBtn.dataset.ivpAdd = '';
  bar.append(playBtn, stopBtn, bpmWrap, beat, h('span', 'ivp-spacer'), addBtn);
  // Play-only (v1.1): nothing can be added.
  addBtn.hidden = mode.peek() === 'play';
  root.appendChild(bar);

  // Buttons give focus back to the page, so Space always toggles Play afterwards.
  const toggle = (): void => {
    if (playing.peek()) pause();
    else void play();
  };
  playBtn.addEventListener('click', () => {
    toggle();
    playBtn.blur();
  });
  stopBtn.addEventListener('click', () => {
    stop();
    stopBtn.blur();
  });
  addBtn.addEventListener('click', () => {
    addMenuOpen.value = !addMenuOpen.value;
  });

  const commit = (): void => {
    const v = parseBpm(bpmInput.value);
    if (v !== undefined) setBpm(v);
    bpmInput.value = String(project.peek().transport.bpm); // show the clamped / stored value
  };
  bpmInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const from = parseBpm(bpmInput.value) ?? project.peek().transport.bpm;
      const next = stepBpm(from, e.key === 'ArrowUp' ? 1 : -1, e.shiftKey);
      bpmInput.value = String(next);
      setBpm(next);
    } else if (e.key === 'Escape') {
      bpmInput.value = String(project.peek().transport.bpm);
      bpmInput.blur();
    }
  });
  bpmInput.addEventListener('blur', commit);

  const onKey = (e: KeyboardEvent): void => {
    const t = e.target instanceof HTMLElement ? e.target : null;
    const ok = shouldTogglePlay({
      key: e.key,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      altKey: e.altKey,
      repeat: e.repeat,
      tag: t?.tagName.toLowerCase() ?? '',
      inputType: t instanceof HTMLInputElement ? t.type : undefined,
      isContentEditable: t?.isContentEditable,
    });
    if (!ok) return;
    e.preventDefault();
    toggle();
  };
  document.addEventListener('keydown', onKey);

  const stops = [
    effect(() => {
      const on = playing.value;
      playBtn.textContent = on ? 'Pause' : 'Play';
      playBtn.setAttribute('aria-label', on ? 'Pause' : 'Play');
    }),
    effect(() => {
      const bpm = project.value.transport.bpm;
      if (document.activeElement !== bpmInput) bpmInput.value = String(bpm);
    }),
    effect(() => {
      const s = deps.value.scheduler.state.value;
      beat.textContent = formatBeat(s.beat, s.numerator);
    }),
  ];

  return () => {
    for (const s of stops) s();
    document.removeEventListener('keydown', onKey);
    bar.remove();
  };
};
