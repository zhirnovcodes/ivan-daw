import { defineConfig } from 'vitest/config';

// One Vitest run for the whole workspace. Playwright specs live in apps/daw/e2e and are not picked up here.
export default defineConfig({
  test: {
    include: [
      'apps/*/src/**/*.test.ts',
      'apps/*/vite/**/*.test.ts',
      'plugins/*/src/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    passWithNoTests: true,
  },
});
