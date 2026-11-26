// Which mode the page opens in (revised 2026-11-23): one parameter, one mode.
//   ?mode=normal     → edit (also when missing or unknown)
//   ?mode=play_only  → play-only: the wiring is locked, the sound stays playable
//   ?mode=dev        → development: normal plus the preset panel (dev server only)
//   ?mode=mobile     → mobile (2026-11-26): play-only for touch screens. Finger pan and pinch zoom,
//                      plugin windows covered (except those with mobileCover: false), only Master's
//                      Volume / Pan, Play, Stop and BPM change. No auto-detection yet.

import type { Mode } from '../canvas/playOnly';

const MODES: Record<string, Mode> = {
  normal: 'edit',
  play_only: 'play',
  dev: 'dev',
  mobile: 'mobile',
};

export function readMode(search: string): Mode {
  const asked = new URLSearchParams(search).get('mode')?.trim().toLowerCase() ?? '';
  return MODES[asked] ?? 'edit';
}
