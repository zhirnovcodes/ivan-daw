// LFO, plugin API v2. Main thread only. Synced to the transport: one cycle per bar, full 0..1 swing,
// sent as `automation` on its modulation output. Design: docs/v1.1-tech-design.md, "5. LFO".

import {
  createTicker,
  type PluginEvent,
  type PluginFactory,
  type PluginInstance,
  type PluginState,
  type PortHandle,
  TICK_MS,
} from 'ivandaw-core';
import { createLfo } from './lfo';
import { LFO_ID, LFO_VERSION, manifest } from './manifest';

const factory: PluginFactory = {
  manifest,
  async create(host) {
    const ctx = host.audioContext;
    const listeners = new Set<(e: PluginEvent) => void>();
    const lfo = createLfo({
      now: () => ctx.currentTime,
      createTicker,
      tickMs: TICK_MS,
      emit(e) {
        for (const l of [...listeners]) l(e);
      },
    });

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
      parameters: () => [],
      parameter: () => 0,
      schedule: (events) => lfo.schedule(events),
      listen(l) {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      subscribe: () => () => {},
      async getState(): Promise<PluginState> {
        return { pluginId: LFO_ID, pluginVersion: LFO_VERSION, data: {} };
      },
      async setState() {},
      mount: () => {},
      unmount: () => {},
      suspend: () => {},
      resume: () => {},
      dispose() {
        lfo.dispose();
        listeners.clear();
      },
    };
    return instance;
  },
};

export default factory;
