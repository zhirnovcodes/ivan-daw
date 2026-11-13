// Library build: dist/index.js (ivandaw-core bundled in) and dist/manifest.json.

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { manifest } from './src/manifest.ts';

const root = import.meta.dirname;

function writeManifest(): Plugin {
  return {
    name: 'ivandaw-manifest',
    buildStart() {
      this.addWatchFile(resolve(root, 'src/manifest.ts'));
    },
    closeBundle() {
      mkdirSync(resolve(root, 'dist'), { recursive: true });
      writeFileSync(resolve(root, 'dist/manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    },
  };
}

export default defineConfig({
  build: {
    target: 'es2022',
    lib: { entry: resolve(root, 'src/index.ts'), formats: ['es'], fileName: () => 'index.js' },
  },
  plugins: [writeManifest()],
});
