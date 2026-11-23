import { defineConfig } from 'vite';
import { pluginsCatalog } from './vite/plugins-catalog';
import { presetLibrary } from './vite/presets';

// The hosted site lives at https://ivancodes.dev/daw/ (Cloudflare, see wrangler.jsonc at the repo
// root). A build uses base /daw/ and writes into dist/daw/, because Cloudflare matches the full
// request path against the uploaded files. `vite preview` serves that build at /daw/ too.
// The dev server stays at / on localhost:5173.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/daw/' : '/',
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  build: { target: 'es2022', outDir: 'dist/daw', emptyOutDir: true },
  plugins: [pluginsCatalog(), presetLibrary()],
}));
