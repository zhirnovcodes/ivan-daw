// The manifest alone, so vite.config.ts can write dist/manifest.json without loading the plugin.

import type { PluginManifest } from 'ivandaw-core';

export const NOTE_GEN_ID = 'com.ivandaw.note-gen';
export const NOTE_GEN_VERSION = '0.0.1';

export const manifest: PluginManifest = {
  id: NOTE_GEN_ID,
  name: 'Note generator',
  vendor: 'IvanDAW',
  version: NOTE_GEN_VERSION,
  apiVersion: 2,
  kind: 'midi',
  ports: [{ id: 'out', label: 'out', kind: 'events', direction: 'out', accepts: ['midi'] }],
  ui: null,
  features: ['state'],
};
