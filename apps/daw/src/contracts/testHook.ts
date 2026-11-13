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
  /** The canvas camera (world point at the canvas's top-left). v1.1. */
  camera(): { x: number; y: number };
  /** 'play' when the page opened at /play_only or with ?play_only. v1.1. */
  mode(): 'edit' | 'play';
}

declare global {
  interface Window {
    __ivandaw?: IvanDawTestHook;
  }
}
