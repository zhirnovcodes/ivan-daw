// Which mode the page opens in (revised 2026-11-23): one parameter, one mode.
//   ?mode=normal     → edit (also when missing or unknown)
//   ?mode=play_only  → play-only: the wiring is locked, the sound stays playable
//   ?mode=dev        → development: normal plus the preset panel (dev server only)
//
// Mobile is a separate parameter (2026-11-26), on top of any mode:
//   ?mobile=true     → the touch-screen version: finger pan and pinch zoom, plugin windows covered
//                      (except those with mobileCover: false), only Master's Volume / Pan, Play, Stop
//                      and BPM change. Stricter than play-only, so play_only changes nothing here;
//                      with mode=dev the preset panel is added (still localhost only).
//   ?mobile=false    → the desktop version, even on a phone
//   missing          → detected: a touch screen with no hover (phones, tablets)

import type { Mode } from '../canvas/playOnly';

const MODES: Record<string, Mode> = {
  normal: 'edit',
  play_only: 'play',
  dev: 'dev',
};

export function readMode(search: string): Mode {
  const asked = new URLSearchParams(search).get('mode')?.trim().toLowerCase() ?? '';
  return MODES[asked] ?? 'edit';
}

/** ?mobile=true / false (also 1 / 0); missing or unknown asks `detect`. */
export function readMobile(search: string, detect: () => boolean): boolean {
  const asked = new URLSearchParams(search).get('mobile')?.trim().toLowerCase() ?? '';
  if (asked === 'true' || asked === '1') return true;
  if (asked === 'false' || asked === '0') return false;
  return detect();
}

/** A phone or tablet: the main pointer is a finger and nothing can hover. */
export const detectMobile = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches;
