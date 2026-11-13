// Entry point. The app shell lives in src/app (P11).

import { boot } from './app/app';

boot().catch((e) => {
  console.error('IvanDAW failed to start', e);
});
