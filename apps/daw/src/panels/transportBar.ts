// The top panel (v1.2): Play / Pause, Stop, BPM, beat readout and a copy of Master's Volume / Pan on the left;
// Add plugin and Sticky note on the right. Design: docs/v1.2-redesign.md, "3. Fixed panels".

import { effect } from '@preact/signals-core';
import type { MountUi } from '../contracts/ui';
import { CTL_GAIN, CTL_PAN } from '../model/control';
import { armValid, GAIN_MAX, MASTER_ID } from '../model/project';
import { addNote, pause, play, setBpm, setGain, setPan, stop } from '../store/actions';
import { deps, mode, playing, project } from '../store/store';
import { addMenuOpen } from './addMenu';
import { formatBpm, parseBpm, stepBpm } from './bpm';
import { ensureStyles, h } from './dom';
import { formatBeat } from './format';
import { ICON_ADD_PLUGIN, ICON_STICKY_NOTE } from './icons';
import { shouldTogglePlay } from './keys';
import { panelServices } from './services';

export const mountTransportBar: MountUi = (root) => {
  ensureStyles();
  const bar = h('div', 'ivp-bar');
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Transport');

  // Left: transport. Right: Add plugin, Sticky note (v1.2 top panel).
  const playBtn = h('button', 'ivp-play', 'Play');
  playBtn.type = 'button';
  const stopBtn = h('button', 'ivp-stop', 'Stop');
  stopBtn.type = 'button';

  const bpmWrap = h('label', 'ivp-bpm');
  const bpmInput = h('input', '');
  bpmInput.type = 'text';
  bpmInput.inputMode = 'decimal';
  bpmInput.setAttribute('aria-label', 'BPM');
  bpmWrap.append('BPM', bpmInput);

  const beat = h('span', 'ivp-beat');
  beat.setAttribute('aria-label', 'Position, bar.beat');

  // Master's Volume and Pan, the same values as the sliders under the Master window.
  const master = h('div', 'ivp-master');
  master.setAttribute('role', 'group');
  master.setAttribute('aria-label', 'Master');
  const masterRange = (label: string, min: number, max: number): HTMLInputElement => {
    const row = h('label', 'ivp-master-row');
    const input = h('input', 'w95-range');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = '0.01';
    input.setAttribute('aria-label', `Master ${label.toLowerCase()}`);
    row.append(h('span', '', label), input);
    master.append(row);
    return input;
  };
  const masterVol = masterRange('Volume', 0, GAIN_MAX);
  const masterPan = masterRange('Pan', -1, 1);
  masterVol.addEventListener('input', () => setGain(MASTER_ID, Number(masterVol.value)));
  masterPan.addEventListener('input', () => setPan(MASTER_ID, Number(masterPan.value)));
  masterPan.addEventListener('dblclick', () => setPan(MASTER_ID, 0));

  const iconBtn = (label: string, icon: string): HTMLButtonElement => {
    const b = h('button', 'ivp-icon-btn');
    b.type = 'button';
    b.setAttribute('aria-label', label);
    const img = h('span', 'ivp-icon');
    img.innerHTML = icon; // our own static SVG from icons.ts
    b.append(img, h('span', 'ivp-caption', label));
    return b;
  };
  const addBtn = iconBtn('Add plugin', ICON_ADD_PLUGIN);
  addBtn.dataset.ivpAdd = '';
  const noteBtn = iconBtn('Sticky note', ICON_STICKY_NOTE);
  noteBtn.dataset.ivpNote = '';
  bar.append(
    playBtn,
    stopBtn,
    bpmWrap,
    beat,
    h('span', 'ivp-sep'),
    master,
    h('span', 'ivp-spacer'),
    addBtn,
    noteBtn,
  );
  // Play-only (v1.1): nothing can be added.
  addBtn.hidden = mode.peek() === 'play';
  noteBtn.hidden = mode.peek() === 'play';
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
  noteBtn.addEventListener('click', () => {
    const c = panelServices().canvasCenter();
    addNote(c.x, c.y);
    noteBtn.blur();
  });
  addBtn.addEventListener('click', () => {
    addMenuOpen.value = !addMenuOpen.value;
  });

  const commit = (): void => {
    const v = parseBpm(bpmInput.value);
    if (v !== undefined) setBpm(v);
    bpmInput.value = formatBpm(project.peek().transport.bpm); // show the clamped / stored value
  };
  bpmInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const from = parseBpm(bpmInput.value) ?? project.peek().transport.bpm;
      const next = stepBpm(from, e.key === 'ArrowUp' ? 1 : -1, e.shiftKey);
      bpmInput.value = formatBpm(next);
      setBpm(next);
    } else if (e.key === 'Escape') {
      bpmInput.value = formatBpm(project.peek().transport.bpm);
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
      if (document.activeElement !== bpmInput) bpmInput.value = formatBpm(bpm);
    }),
    effect(() => {
      const p = project.value;
      const m = p.nodes.find((n) => n.id === MASTER_ID);
      if (!m) return;
      if (Number(masterVol.value) !== m.gain) masterVol.value = String(m.gain);
      if (Number(masterPan.value) !== m.pan) masterPan.value = String(m.pan);
      // An ARM link drives it: like the window's sliders, these show the resting value and wait.
      const bound = (port: string) =>
        (p.arms ?? []).some((a) => armValid(a) && a.to.node === MASTER_ID && a.target === port);
      masterVol.disabled = bound(CTL_GAIN);
      masterPan.disabled = bound(CTL_PAN);
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
