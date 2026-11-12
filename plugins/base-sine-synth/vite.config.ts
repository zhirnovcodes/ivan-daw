// Library build: dist/index.js, dist/worklet.js (ivandaw-core bundled in) and dist/manifest.json.
// The worklet is built as its own bundle, so it never imports a chunk shared with index.js.

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build, defineConfig, type Plugin } from 'vite';
import { manifest } from './src/manifest.ts';

const root = import.meta.dirname;

function workletAndManifest(): Plugin {
  return {
    name: 'ivandaw-worklet-and-manifest',
    buildStart() {
      // Watch mode: editing the worklet or the DSP rebuilds everything.
      this.addWatchFile(resolve(root, 'src/worklet.ts'));
      this.addWatchFile(resolve(root, 'src/dsp.ts'));
      this.addWatchFile(resolve(root, 'src/manifest.ts'));
      this.addWatchFile(resolve(root, 'src/test-page.html'));
    },
    async closeBundle() {
      await build({
        configFile: false,
        root,
        logLevel: 'warn',
        build: {
          target: 'es2022',
          emptyOutDir: false,
          lib: {
            entry: resolve(root, 'src/worklet.ts'),
            formats: ['es'],
            fileName: () => 'worklet.js',
          },
        },
      });
      mkdirSync(resolve(root, 'dist'), { recursive: true });
      // Served at /plugins/<id>/test-page.html, next to index.js.
      copyFileSync(resolve(root, 'src/test-page.html'), resolve(root, 'dist/test-page.html'));
      writeFileSync(resolve(root, 'dist/manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    },
  };
}

export default defineConfig({
  build: {
    target: 'es2022',
    lib: { entry: resolve(root, 'src/index.ts'), formats: ['es'], fileName: () => 'index.js' },
  },
  plugins: [workletAndManifest()],
});
