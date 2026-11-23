// Note hold, plugin API v2. Main thread only: no worklet, no audio, no ticker.
// Holds one note (default C1) from Play to Stop; Stop / Run next bar release and restart it. Design: docs/v1.1-tech-design.md, "3. Note hold".

import {
  createTicker,
  type ParameterChange,
  type ParameterInfo,
  type PluginEvent,
  type PluginFactory,
  type PluginInstance,
  type PluginState,
  type PortHandle,
} from 'ivandaw-core';
import { createHold, DEFAULT_NOTE, NOTE_MAX, noteName, toNote } from './hold';
import { manifest, NOTE_HOLD_ID, NOTE_HOLD_VERSION } from './manifest';

const PARAMS: ParameterInfo[] = [
  {
    id: 'note',
    label: 'Note',
    kind: 'int',
    min: 0,
    max: NOTE_MAX,
    default: DEFAULT_NOTE,
    automatable: true,
    format: (v) => noteName(Math.round(v)),
  },
  // v1.2: waits for the next bar line, starts the note there and switches itself off.
  {
    id: 'run',
    label: 'Run next bar',
    kind: 'boolean',
    min: 0,
    max: 1,
    default: 0,
    automatable: false,
    format: (v) => (v >= 0.5 ? 'waiting' : ''),
  },
  // v1.2: releases the note; the transport plays on.
  { id: 'stop', label: 'Stop', kind: 'trigger', min: 0, max: 1, default: 0, automatable: false },
];

const factory: PluginFactory = {
  manifest,
  async create(host) {
    const ctx = host.audioContext;
    const listeners = new Set<(e: PluginEvent) => void>();
    const watchers = new Set<(c: ParameterChange) => void>();
    const tell = (c: ParameterChange) => {
      for (const w of [...watchers]) w(c);
    };
    const hold = createHold({
      emit: (e) => {
        for (const l of [...listeners]) l(e);
      },
      now: () => ctx.currentTime,
      createTicker,
      onNote: (n) => tell({ id: 'note', value: n / NOTE_MAX, source: 'host' }),
      onRun: (on) => tell({ id: 'run', value: on ? 1 : 0, source: 'internal' }),
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
      parameters: () => PARAMS,
      parameter: (id) =>
        id === 'note' ? hold.note() / NOTE_MAX : id === 'run' && hold.armed() ? 1 : 0,
      schedule: (events) => hold.schedule(events),
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
          pluginId: NOTE_HOLD_ID,
          pluginVersion: NOTE_HOLD_VERSION,
          data: { note: hold.note() },
        };
      },
      async setState(s) {
        const n = (s.data as { note?: unknown } | null)?.note;
        if (typeof n === 'number') {
          hold.schedule([
            {
              type: 'automation',
              time: ctx.currentTime,
              id: 'note',
              value: toNote(n / NOTE_MAX) / NOTE_MAX,
            },
          ]);
        }
      },
      mount: () => {},
      unmount: () => {},
      suspend: () => {},
      resume: () => {},
      dispose() {
        hold.dispose(ctx.currentTime);
        listeners.clear();
        watchers.clear();
      },
    };
    return instance;
  },
};

export default factory;
