// Control sliders, plugin API v2. Two sliders (`a`, `b`) in the node panel, each driving its own
// modulation output. Design: docs/v1.1-tech-design.md, "6. Control sliders".

import type {
  ParameterChange,
  ParameterInfo,
  PluginEvent,
  PluginFactory,
  PluginInstance,
  PluginState,
  PortHandle,
} from 'ivandaw-core';
import { manifest, SLIDERS_ID, SLIDERS_VERSION } from './manifest';
import { createSliders, DEFAULT_VALUE, SLIDER_IDS } from './sliders';

const PARAMS: ParameterInfo[] = SLIDER_IDS.map((id) => ({
  id,
  label: `Slider ${id.toUpperCase()}`,
  kind: 'float',
  min: 0,
  max: 1,
  default: DEFAULT_VALUE,
  automatable: true,
  format: (v: number) => `${Math.round(v * 100)}%`,
}));

const factory: PluginFactory = {
  manifest,
  async create(host) {
    const ctx = host.audioContext;
    const listeners = new Set<(e: PluginEvent) => void>();
    const watchers = new Set<(c: ParameterChange) => void>();
    const sliders = createSliders(
      (e) => {
        for (const l of [...listeners]) l(e);
      },
      (id, value) => {
        for (const w of [...watchers]) w({ id, value, source: 'host' });
      },
    );

    const ports = new Map<string, PortHandle>(
      manifest.ports.map((info): [string, PortHandle] => [
        info.id,
        { info: info as PortHandle['info'] & { kind: 'modulation' } },
      ]),
    );

    const instance: PluginInstance = {
      ports,
      latency: 0,
      tail: 0,
      parameters: () => PARAMS,
      parameter: (id) => sliders.value(id),
      schedule: (events) => sliders.schedule(events),
      listen(l) {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      subscribe(w) {
        watchers.add(w);
        return () => watchers.delete(w);
      },
      async getState(): Promise<PluginState> {
        return {
          pluginId: SLIDERS_ID,
          pluginVersion: SLIDERS_VERSION,
          data: { a: sliders.value('a'), b: sliders.value('b') },
        };
      },
      async setState(s) {
        const d = (s.data ?? {}) as Record<string, unknown>;
        for (const id of SLIDER_IDS) {
          const v = d[id];
          if (typeof v === 'number') {
            sliders.schedule([{ type: 'automation', time: ctx.currentTime, id, value: v }]);
          }
        }
      },
      mount: () => {},
      unmount: () => {},
      suspend: () => {},
      resume: () => {},
      dispose() {
        listeners.clear();
        watchers.clear();
      },
    };
    return instance;
  },
};

export default factory;
