// The manifest alone, so vite.config.ts can write dist/manifest.json without loading the plugin.

import type { PluginManifest, PortInfo } from 'ivandaw-core';

export const SYNTH_ID = 'com.ivandaw.base-sine-synth';
export const SYNTH_VERSION = '0.0.1';
export const PROCESSOR_NAME = 'ivandaw-base-sine-synth';

const inPort: PortInfo = {
  id: 'in',
  label: 'in',
  kind: 'events',
  direction: 'in',
  accepts: ['midi', 'automation', 'transport', 'tempo'],
};

const outPort: PortInfo = {
  id: 'out',
  label: 'out',
  kind: 'audio',
  direction: 'out',
  channels: 2,
  main: true,
};

export const manifest: PluginManifest = {
  id: SYNTH_ID,
  name: 'Base sine synth',
  vendor: 'IvanDAW',
  version: SYNTH_VERSION,
  apiVersion: 2,
  kind: 'instrument',
  ports: [inPort, outPort],
  ui: null,
  features: ['sample-accurate', 'state'],
};
