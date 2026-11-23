// Library build: dist/index.js, dist/worklet.js, dist/morph-filter.wasm and dist/manifest.json.
// The worklet is its own bundle, so it never imports a chunk shared with index.js.
// The wasm is prebuilt (`pnpm build:wasm`, needs emsdk) and only copied here, so CI needs no emsdk.

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build, defineConfig, type Plugin } from 'vite';
import { manifest } from './src/manifest.ts';

const root = import.meta.dirname;

function workletWasmAndManifest(): Plugin {
  return {
    name: 'ivandaw-worklet-wasm-and-manifest',
    buildStart() {
      this.addWatchFile(resolve(root, 'src/worklet.ts'));
      this.addWatchFile(resolve(root, 'src/params.ts'));
      this.addWatchFile(resolve(root, 'src/manifest.ts'));
      this.addWatchFile(resolve(root, 'prebuilt/morph-filter.wasm'));
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
      copyFileSync(
        resolve(root, 'prebuilt/morph-filter.wasm'),
        resolve(root, 'dist/morph-filter.wasm'),
      );
      writeFileSync(resolve(root, 'dist/manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    },
  };
}

export default defineConfig({
  build: {
    target: 'es2022',
    lib: { entry: resolve(root, 'src/index.ts'), formats: ['es'], fileName: () => 'index.js' },
  },
  plugins: [workletWasmAndManifest()],
});
