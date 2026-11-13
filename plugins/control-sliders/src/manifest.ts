// The manifest alone, so vite.config.ts can write dist/manifest.json without loading the plugin.

import type { PluginManifest } from 'ivandaw-core';

export const SLIDERS_ID = 'com.ivandaw.control-sliders';
export const SLIDERS_VERSION = '0.0.1';

export const manifest: PluginManifest = {
  id: SLIDERS_ID,
  name: 'Control sliders',
  vendor: 'IvanDAW',
  version: SLIDERS_VERSION,
  apiVersion: 2,
  kind: 'modulator',
  ports: [
    { id: 'a', label: 'a', kind: 'modulation', direction: 'out' },
    { id: 'b', label: 'b', kind: 'modulation', direction: 'out' },
  ],
  ui: null,
  features: ['state'],
};
