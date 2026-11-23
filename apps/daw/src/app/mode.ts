// Which mode the page opens in (revised 2026-11-23): one parameter, one mode.
//   ?mode=normal     → edit (also when missing or unknown)
//   ?mode=play_only  → play-only: the wiring is locked, the sound stays playable
//   ?mode=dev        → development: normal plus the preset panel (dev server only)

import type { Mode } from '../canvas/playOnly';

const MODES: Record<string, Mode> = { normal: 'edit', play_only: 'play', dev: 'dev' };

export function readMode(search: string): Mode {
  const asked = new URLSearchParams(search).get('mode')?.trim().toLowerCase() ?? '';
  return MODES[asked] ?? 'edit';
}
