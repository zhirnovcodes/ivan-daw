// Note generator, plugin API v2. Main thread only: no worklet, no audio.
// One note per beat: C3, 100 velocity, half a beat long.

import {
  createTicker,
  type ParameterChange,
  type PluginEvent,
  type PluginFactory,
  type PluginInstance,
  type PluginState,
  type PortHandle,
  TICK_MS,
} from 'ivandaw-core';
import { createGenerator } from './generator';
import { manifest, NOTE_GEN_ID, NOTE_GEN_VERSION } from './manifest';

const factory: PluginFactory = {
  manifest,
  async create(host) {
    const ctx = host.audioContext;
    const listeners = new Set<(e: PluginEvent) => void>();
    const generator = createGenerator({
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
        { info: info as PortHandle['info'] & { kind: 'events' } },
      ]),
    );

    const instance: PluginInstance = {
      ports,
      latency: 0,
      tail: 0,
      parameters: () => [],
      parameter: () => 0,
      schedule: (events) => generator.schedule(events),
      listen(l) {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      subscribe: (_l: (c: ParameterChange) => void) => () => {},
      async getState(): Promise<PluginState> {
        return { pluginId: NOTE_GEN_ID, pluginVersion: NOTE_GEN_VERSION, data: {} };
      },
      async setState() {},
      mount: () => {},
      unmount: () => {},
      suspend: () => {},
      resume: () => {},
      dispose() {
        generator.dispose();
        listeners.clear();
      },
    };
    return instance;
  },
};

export default factory;
