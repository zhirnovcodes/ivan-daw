// The manifest alone, so vite.config.ts can write dist/manifest.json without loading the plugin.

import type { PluginManifest } from 'ivandaw-core';

export const LFO_ID = 'com.ivandaw.lfo';
export const LFO_VERSION = '0.0.1';

export const manifest: PluginManifest = {
  id: LFO_ID,
  name: 'LFO',
  vendor: 'IvanDAW',
  version: LFO_VERSION,
  apiVersion: 2,
  kind: 'modulator',
  ports: [{ id: 'out', label: 'out', kind: 'modulation', direction: 'out' }],
  ui: null,
  features: [],
};
