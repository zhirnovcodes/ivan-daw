// Contract C7: the test hook Playwright drives. Installed by the app shell in dev builds.
// Tech design: "Testing".

import type { Project } from '../model/project';

export interface IvanDawTestHook {
  play(): Promise<void>;
  stop(): void;
  /** RMS of Master's output: > 0.01 while a note sounds, < 0.001 when silent. */
  rms(): number;
  project(): Project;
  /** Node id → 'loading' | 'ready' | 'error'. */
  status(): Record<string, string>;
  /** The canvas camera: world point at the canvas's top-left (v1.1) and zoom `z`, 1 = 100% (v1.1.2). */
  camera(): { x: number; y: number; z: number };
  /** From ?mode=: normal → 'edit', play_only → 'play', dev → 'dev' (dev server only). */
  mode(): 'edit' | 'play' | 'dev';
  /** From ?mobile=true / false, else detected (a touch screen with no hover). */
  mobile(): boolean;
}

declare global {
  interface Window {
    __ivandaw?: IvanDawTestHook;
  }
}
