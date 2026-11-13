// Test page host: a tiny stand-in for the DAW. Loads note-gen and the base sine synth from the
// catalog, plays the note generator into the synth, and sends transport events like the scheduler does.
// Bundled to dist/test-page.js so it can use the ivandaw-core timing helpers.

import {
  type Anchor,
  allNotesOff,
  beatAt,
  type HostContext,
  type PluginEvent,
  type PluginFactory,
  type PluginInstance,
  type TransportState,
} from 'ivandaw-core';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

interface CatalogPlugin {
  id: string;
  url: string;
}

async function load(id: string, host: HostContext): Promise<PluginInstance> {
  const res = await fetch('/plugins/catalog.json');
  const catalog = (await res.json()) as { plugins: CatalogPlugin[] };
  const entry = catalog.plugins.find((p) => p.id === id);
  if (!entry) throw new Error(`${id} is not in /plugins/catalog.json (is it built?)`);
  const mod = (await import(/* @vite-ignore */ entry.url)) as { default: PluginFactory };
  return mod.default.create(host, null);
}

async function main() {
  const ctx = new AudioContext({ latencyHint: 'interactive' });
  const master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(ctx.destination);
  const meter = ctx.createAnalyser();
  meter.fftSize = 2048;
  master.connect(meter);

  const host = {
    audioContext: ctx,
    apiVersion: 2,
    slotId: 'test-page',
    transport: () => state(),
    notify: (level: string, msg: string) => console.log(level, msg),
    markDirty: () => {},
    assetUrl: (p: string) => p,
    resume: () => void ctx.resume(),
    dispose: () => {},
  } as unknown as HostContext;

  const gen = await load('com.ivandaw.note-gen', host);
  const synth = await load('com.ivandaw.base-sine-synth', host);
  const out = synth.ports.get('out');
  if (out && 'node' in out) out.node.connect(master);
  const sent: PluginEvent[] = [];
  gen.listen((e) => {
    sent.push(e);
    synth.schedule([e]);
  });

  let anchor: Anchor = {
    state: { playing: false, bpm: 120, beat: 0, numerator: 4, denominator: 4, loop: null },
    time: 0,
  };
  const state = (): TransportState => ({
    ...anchor.state,
    beat: anchor.state.playing ? beatAt(ctx.currentTime, anchor) : anchor.state.beat,
  });
  const bpmInput = $<HTMLInputElement>('bpm');
  const bpm = () => Math.min(200, Math.max(60, Number(bpmInput.value) || 120));
  const both = (events: PluginEvent[]) => {
    gen.schedule(events);
    synth.schedule(events);
  };
  const show = () => {
    $('status').textContent =
      `${ctx.state} · ${anchor.state.playing ? 'playing' : 'stopped'} · ${anchor.state.bpm} BPM`;
  };

  $('play').addEventListener('click', async () => {
    await ctx.resume();
    if (anchor.state.playing) return;
    const time = ctx.currentTime + 0.05;
    anchor = { state: { ...anchor.state, playing: true, bpm: bpm(), beat: 0 }, time };
    both([{ type: 'transport', time, state: anchor.state }]);
    show();
  });
  $('stop').addEventListener('click', () => {
    const time = ctx.currentTime;
    anchor = { state: { ...anchor.state, playing: false, beat: 0 }, time };
    both([
      { type: 'transport', time, state: anchor.state },
      { type: 'midi', time, bytes: allNotesOff() },
    ]);
    show();
  });
  bpmInput.addEventListener('change', () => {
    const value = bpm();
    bpmInput.value = String(value);
    if (!anchor.state.playing) {
      anchor = { ...anchor, state: { ...anchor.state, bpm: value } };
      show();
      return;
    }
    // Like the scheduler: tempo + a new anchor at now, the beat stays continuous.
    const time = ctx.currentTime;
    anchor = { state: { ...anchor.state, bpm: value, beat: beatAt(time, anchor) }, time };
    both([
      { type: 'tempo', time, bpm: value },
      { type: 'transport', time, state: anchor.state },
    ]);
    show();
  });
  addEventListener('pointerdown', () => ctx.resume());
  ctx.addEventListener('statechange', show);

  const buf = new Float32Array(meter.fftSize);
  (window as unknown as { noteGenTest: unknown }).noteGenTest = {
    /** RMS of the last 2048 output samples. */
    rms() {
      meter.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      return Math.sqrt(sum / buf.length);
    },
    sent: () => sent.length,
  };
  ($('play') as HTMLButtonElement).disabled = false;
  ($('stop') as HTMLButtonElement).disabled = false;
  show();
}

main().catch((err) => {
  $('status').textContent = `error: ${err instanceof Error ? err.message : String(err)}`;
});
