// Base sine synth, plugin API v2. The host loads this module with import(url).

import {
  isAllOff,
  type ParameterChange,
  type ParameterInfo,
  type PluginEvent,
  type PluginFactory,
  type PluginInstance,
  type PluginState,
  type PortHandle,
  parse,
} from 'ivandaw-core';
import { DEFAULT_LEVEL, levelToDb, RELEASE_S, type SynthEvent } from './dsp';
import { manifest, PROCESSOR_NAME, SYNTH_ID, SYNTH_VERSION } from './manifest';

const levelInfo: ParameterInfo = {
  id: 'level',
  label: 'Level',
  kind: 'float',
  min: 0,
  max: 1,
  default: DEFAULT_LEVEL,
  automatable: true,
  format: levelToDb,
};

const factory: PluginFactory = {
  manifest,
  async create(host) {
    const ctx = host.audioContext;
    // The build writes worklet.js next to index.js. @vite-ignore keeps Vite from inlining src/worklet.ts.
    await ctx.audioWorklet.addModule(new URL(/* @vite-ignore */ './worklet.js', import.meta.url));
    const node = new AudioWorkletNode(ctx, PROCESSOR_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    let level = DEFAULT_LEVEL;
    const listeners = new Set<(c: ParameterChange) => void>();
    const frameOf = (time: number) => Math.round(Math.max(time, ctx.currentTime) * ctx.sampleRate);

    const setLevel = (value: number, frame: number, source: ParameterChange['source']) => {
      level = Math.min(1, Math.max(0, value));
      node.port.postMessage({ type: 'events', events: [{ frame, kind: 'level', value: level }] });
      for (const l of listeners) l({ id: 'level', value: level, source });
    };

    const ports = new Map<string, PortHandle>(
      manifest.ports.map((info): [string, PortHandle] => [
        info.id,
        info.kind === 'audio' && info.direction === 'out'
          ? { info, node, index: 0 }
          : { info: info as PortHandle['info'] & { kind: 'events' } },
      ]),
    );

    const instance: PluginInstance = {
      ports,
      latency: 0,
      tail: RELEASE_S,
      parameters: () => [levelInfo],
      parameter: (id) => (id === 'level' ? level : 0),
      schedule(events: PluginEvent[]) {
        const out: SynthEvent[] = [];
        for (const e of events) {
          const frame = frameOf(e.time);
          if (e.type === 'midi') {
            if (isAllOff(e.bytes)) {
              out.push({ frame, kind: 'allOff' });
              continue;
            }
            const m = parse(e.bytes);
            if (m.note === undefined) continue;
            if (m.type === 'noteOn') out.push({ frame, kind: 'on', note: m.note });
            else if (m.type === 'noteOff') out.push({ frame, kind: 'off', note: m.note });
          } else if (e.type === 'automation' && e.id === 'level') {
            setLevel(e.value, frame, e.source === 'binding' ? 'binding' : 'host');
          }
          // tempo and transport events are accepted and ignored: a sine synth has no use for them.
        }
        if (out.length > 0) node.port.postMessage({ type: 'events', events: out });
      },
      listen: () => () => {},
      subscribe(l) {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      async getState(): Promise<PluginState> {
        return { pluginId: SYNTH_ID, pluginVersion: SYNTH_VERSION, data: { level } };
      },
      async setState(s: PluginState) {
        const data = s.data as { level?: unknown } | null;
        if (data && typeof data.level === 'number') setLevel(data.level, 0, 'internal');
      },
      mount: () => {},
      unmount: () => {},
      suspend: () => {},
      resume: () => {},
      dispose() {
        node.port.close();
        node.disconnect();
        listeners.clear();
      },
    };
    return instance;
  },
};

export default factory;
