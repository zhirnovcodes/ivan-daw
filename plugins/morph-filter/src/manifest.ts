// The manifest alone, so vite.config.ts can write dist/manifest.json without loading the plugin.

import type { PluginManifest } from 'ivandaw-core';

export const MORPH_ID = 'com.ivandaw.morph-filter';
export const MORPH_VERSION = '0.0.1';
export const PROCESSOR_NAME = 'ivandaw-morph-filter';

/** The UI box from the design (Frame 3): 128 x 128. */
export const UI_SIZE = 128;

export const manifest: PluginManifest = {
  id: MORPH_ID,
  name: 'Morph filter',
  vendor: 'IvanDAW',
  version: MORPH_VERSION,
  apiVersion: 2,
  kind: 'effect',
  ports: [
    { id: 'in', label: 'in', kind: 'audio', direction: 'in', channels: 2, main: true },
    { id: 'out', label: 'out', kind: 'audio', direction: 'out', channels: 2, main: true },
  ],
  ui: { width: UI_SIZE, height: UI_SIZE, resizable: false },
  features: ['sample-accurate', 'state'],
};
