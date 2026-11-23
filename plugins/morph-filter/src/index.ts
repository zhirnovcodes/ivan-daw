// Morph filter, plugin API v2: audio in -> ivan-daw-engine-core's Morph filter -> audio out.
// Two knobs, the same as AxolotlPad's oscillator filter: D/W (amount + resonance) and FREQ (LP -> BP -> HP).

import type {
  ParameterChange,
  ParameterInfo,
  PluginFactory,
  PluginInstance,
  PluginState,
  PortHandle,
} from 'ivandaw-core';
import { MORPH_ID, MORPH_VERSION, manifest, PROCESSOR_NAME } from './manifest';
import {
  clamp01,
  DW_DEFAULT,
  FREQ_DEFAULT,
  formatHz,
  formatPercent,
  type ParamEvent,
  type ParamId,
} from './params';
import { type MountedUi, mountUi } from './ui';

const PARAMS: ParameterInfo[] = [
  {
    id: 'dw',
    label: 'D/W',
    kind: 'float',
    min: 0,
    max: 1,
    default: DW_DEFAULT,
    automatable: true,
    format: formatPercent,
  },
  {
    id: 'freq',
    label: 'Freq',
    kind: 'float',
    min: 0,
    max: 1,
    default: FREQ_DEFAULT,
    automatable: true,
    format: formatHz,
  },
];

const isParam = (id: string): id is ParamId => id === 'dw' || id === 'freq';

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not load ${url} (${res.status})`);
  return res.arrayBuffer();
}

const factory: PluginFactory = {
  manifest,
  async create(host) {
    const ctx = host.audioContext;
    await ctx.audioWorklet.addModule(host.assetUrl('worklet.js'));
    const node = new AudioWorkletNode(ctx, PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
    });

    const ready = new Promise<void>((resolve, reject) => {
      node.port.onmessage = (ev: MessageEvent<{ type: string; message?: string }>) => {
        if (ev.data.type === 'ready') resolve();
        else if (ev.data.type === 'error') {
          const msg = `Morph filter: ${ev.data.message ?? 'wasm failed'}`;
          host.notify('error', msg);
          reject(new Error(msg));
        }
      };
    });
    ready.catch(() => {}); // awaited below
    try {
      const wasm = await fetchBytes(host.assetUrl('morph-filter.wasm'));
      node.port.postMessage({ type: 'init', wasm }, [wasm]);
      await ready;
    } catch (e) {
      node.port.postMessage({ type: 'dispose' });
      node.disconnect();
      throw e;
    }

    const values: Record<ParamId, number> = { dw: DW_DEFAULT, freq: FREQ_DEFAULT };
    const listeners = new Set<(c: ParameterChange) => void>();
    let ui: MountedUi | null = null;
    const frameOf = (time: number) => Math.round(Math.max(time, ctx.currentTime) * ctx.sampleRate);

    const setParam = (
      id: ParamId,
      value: number,
      frame: number,
      source: ParameterChange['source'],
      gesture?: 'begin' | 'end',
    ) => {
      values[id] = clamp01(value);
      const ev: ParamEvent = { frame, id, value: values[id] };
      node.port.postMessage({ type: 'params', events: [ev] });
      if (source !== 'ui') ui?.update(id);
      const change: ParameterChange = { id, value: values[id], source };
      if (gesture) change.gesture = gesture;
      for (const l of listeners) l(change);
    };

    const ports = new Map<string, PortHandle>([
      ['in', { info: manifest.ports[0] as PortHandle['info'] & { kind: 'audio' }, node, index: 0 }],
      [
        'out',
        { info: manifest.ports[1] as PortHandle['info'] & { kind: 'audio' }, node, index: 0 },
      ],
    ]);

    const instance: PluginInstance = {
      ports,
      latency: 0,
      tail: 0.1, // the resonance rings briefly after the input stops
      parameters: () => PARAMS,
      parameter: (id) => (isParam(id) ? values[id] : 0),
      schedule(events) {
        for (const e of events) {
          if (e.type !== 'automation' || !isParam(e.id)) continue; // no MIDI, tempo or transport use
          setParam(e.id, e.value, frameOf(e.time), e.source === 'binding' ? 'binding' : 'host');
        }
      },
      listen: () => () => {},
      subscribe(l) {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      async getState(): Promise<PluginState> {
        return { pluginId: MORPH_ID, pluginVersion: MORPH_VERSION, data: { ...values } };
      },
      async setState(s: PluginState) {
        const data = s.data as Partial<Record<ParamId, unknown>> | null;
        for (const id of ['dw', 'freq'] as const) {
          const v = data?.[id];
          if (typeof v === 'number') setParam(id, v, 0, 'internal');
        }
      },
      mount(container) {
        ui?.destroy();
        ui = mountUi(container, {
          get: (id) => values[id],
          set: (id, value, gesture) => {
            setParam(id, value, frameOf(ctx.currentTime), 'ui', gesture);
            host.markDirty();
          },
          defaults: { dw: DW_DEFAULT, freq: FREQ_DEFAULT },
          format: { dw: formatPercent, freq: formatHz },
        });
      },
      unmount() {
        ui?.destroy();
        ui = null;
      },
      suspend: () => {},
      resume: () => {},
      dispose() {
        ui?.destroy();
        ui = null;
        node.port.postMessage({ type: 'dispose' });
        node.port.close();
        node.disconnect();
        listeners.clear();
      },
    };
    return instance;
  },
};

export default factory;
