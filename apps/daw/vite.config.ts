import { defineConfig } from 'vite';
import { pluginsCatalog } from './vite/plugins-catalog';

export default defineConfig({
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  build: { target: 'es2022' },
  plugins: [pluginsCatalog()],
});
