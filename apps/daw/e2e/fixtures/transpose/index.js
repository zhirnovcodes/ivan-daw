// Test-only MIDI → MIDI plugin (E1): forwards every note transposed by +12 and passes other MIDI
// (CC 123 all-notes-off) through. Lives under e2e/fixtures, not plugins/, so it never shows in the
// real plugin list; e2e/fixtures.ts serves it by intercepting the catalog. Plugin API v2.

const manifest = {
  id: 'test.e2e.transpose',
  name: 'E2E transpose',
  vendor: 'IvanDAW tests',
  version: '0.0.0',
  apiVersion: 2,
  kind: 'midi',
  ports: [
    { id: 'in', label: 'in', kind: 'events', direction: 'in', accepts: ['midi', 'transport'] },
    { id: 'out', label: 'out', kind: 'events', direction: 'out', accepts: ['midi'] },
  ],
  ui: null,
  features: [],
};

function transpose(bytes) {
  const status = bytes[0] & 0xf0;
  if (status !== 0x90 && status !== 0x80) return bytes;
  return [bytes[0], Math.min(127, bytes[1] + 12), bytes[2]];
}

export default {
  manifest,
  async create() {
    const listeners = new Set();
    const emit = (e) => {
      for (const l of [...listeners]) l(e);
    };
    return {
      ports: new Map(manifest.ports.map((info) => [info.id, { info }])),
      latency: 0,
      tail: 0,
      parameters: () => [],
      parameter: () => 0,
      schedule(events) {
        for (const e of events) {
          if (e.type === 'midi') emit({ type: 'midi', time: e.time, bytes: transpose(e.bytes) });
        }
      },
      listen(l) {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      subscribe: () => () => {},
      getState: async () => ({ pluginId: manifest.id, pluginVersion: manifest.version, data: {} }),
      setState: async () => {},
      mount: () => {},
      unmount: () => {},
      suspend: () => {},
      resume: () => {},
      dispose: () => listeners.clear(),
    };
  },
};
