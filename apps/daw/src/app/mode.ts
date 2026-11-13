// v1.1: which mode the page opens in. `/play_only` or `?play_only` → play-only; anything else → edit.

import type { Mode } from '../canvas/playOnly';

export function readMode(url: { pathname: string; search: string }): Mode {
  const path = url.pathname.replace(/\/+$/, '');
  if (path.endsWith('/play_only')) return 'play';
  return new URLSearchParams(url.search).has('play_only') ? 'play' : 'edit';
}
