// Library build: dist/index.js (ivandaw-core bundled in), dist/manifest.json, dist/test-page.html and
// dist/test-page.js (the test page's host code, built as its own bundle).

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build, defineConfig, type Plugin } from 'vite';
import { manifest } from './src/manifest.ts';

const root = import.meta.dirname;

function manifestAndTestPage(): Plugin {
  return {
    name: 'ivandaw-manifest-and-test-page',
    buildStart() {
      this.addWatchFile(resolve(root, 'src/manifest.ts'));
      this.addWatchFile(resolve(root, 'src/test-page.html'));
      this.addWatchFile(resolve(root, 'src/test-page.ts'));
    },
    async closeBundle() {
      // The test page host is its own bundle, so index.js stays the plugin alone.
      await build({
        configFile: false,
        root,
        logLevel: 'warn',
        build: {
          target: 'es2022',
          emptyOutDir: false,
          lib: {
            entry: resolve(root, 'src/test-page.ts'),
            formats: ['es'],
            fileName: () => 'test-page.js',
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
  plugins: [manifestAndTestPage()],
});
