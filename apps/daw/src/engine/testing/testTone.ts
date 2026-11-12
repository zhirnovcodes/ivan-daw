// A throwaway API v2 instrument for testing the engine before the real plugins (P6) exist.
// One sine voice. Every start, stop and change is a ramp, so it never clicks.

import {
  isAllOff,
  noteToHz,
  type PluginEvent,
  type PluginFactory,
  type PluginInstance,
  type PortHandle,
  type PortInfo,
  parse,
} from 'ivandaw-core';

export const TEST_TONE_ID = 'dev.ivandaw.test-tone';

const ATTACK = 0.005;
const RELEASE = 0.03;
const PEAK = 0.25;

const inPort: PortInfo = {
  id: 'in',
  label: 'in',
  kind: 'events',
  direction: 'in',
  accepts: ['midi', 'automation'],
};
const outPort: PortInfo & { kind: 'audio' } = {
  id: 'out',
  label: 'out',
  kind: 'audio',
  direction: 'out',
  channels: 2,
  main: true,
};

export const testToneFactory: PluginFactory = {
  manifest: {
    id: TEST_TONE_ID,
    name: 'Test tone',
    vendor: 'IvanDAW',
    version: '0.0.0',
    apiVersion: 2,
    kind: 'instrument',
    ports: [inPort, outPort],
    ui: null,
    features: ['sample-accurate'],
  },
  async create(host) {
    const ctx = host.audioContext;
    const osc = ctx.createOscillator();
    const vca = ctx.createGain();
    vca.gain.value = 0;
    osc.connect(vca);
    osc.start();
    let level = 1;
    let held: number | null = null;

    const fadeTo = (v: number, t: number, d: number) => {
      const g = vca.gain;
      if (typeof g.cancelAndHoldAtTime === 'function') g.cancelAndHoldAtTime(t);
      else {
        g.cancelScheduledValues(t);
        g.setValueAtTime(g.value, t);
      }
      g.linearRampToValueAtTime(v, t + d);
    };

    const ports = new Map<string, PortHandle>([
      ['in', { info: inPort }],
      ['out', { info: outPort, node: vca, index: 0 }],
    ]);

    const instance: PluginInstance = {
      ports,
      latency: 0,
      tail: RELEASE,
      parameters: () => [
        {
          id: 'level',
          label: 'Level',
          kind: 'float',
          min: 0,
          max: 1,
          default: 1,
          automatable: true,
        },
      ],
      parameter: (id) => (id === 'level' ? level : 0),
      schedule(events: PluginEvent[]) {
        for (const e of events) {
          const t = Math.max(e.time, ctx.currentTime);
          if (e.type === 'automation' && e.id === 'level') {
            level = e.value;
            if (held !== null) fadeTo(PEAK * level, t, ATTACK);
          } else if (e.type === 'midi') {
            const m = parse(e.bytes);
            if (m.type === 'noteOn' && m.note !== undefined) {
              held = m.note;
              osc.frequency.setValueAtTime(noteToHz(m.note), t);
              fadeTo(PEAK * level, t, ATTACK);
            } else if ((m.type === 'noteOff' && m.note === held) || isAllOff(e.bytes)) {
              held = null;
              fadeTo(0, t, RELEASE);
            }
          }
        }
      },
      listen: () => () => {},
      subscribe: () => () => {},
      getState: async () => ({ pluginId: TEST_TONE_ID, pluginVersion: '0.0.0', data: {} }),
      setState: async () => {},
      mount: () => {},
      unmount: () => {},
      suspend: () => {},
      resume: () => {},
      dispose() {
        osc.stop();
        osc.disconnect();
        vca.disconnect();
      },
    };
    return instance;
  },
};
