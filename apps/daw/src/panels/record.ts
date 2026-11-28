// The Record button's states (2026-11-28). Desktop only, left of Play.
//   off        dark green circle, caption REC
//   armed      red circle fading in and out, caption WAITING: recording starts on the next Play
//   recording  solid red circle, caption = time left (red under 10 s)
// Pause keeps recording (it records what is heard). Stop, Record again, or reaching the limit ends it
// and asks "Save progress?" (playback goes on). Pressing Record while armed disarms.

export type RecState = 'off' | 'armed' | 'recording';

export type RecEvent =
  | { type: 'press'; playing: boolean }
  | { type: 'play' }
  | { type: 'stop' }
  | { type: 'limit' };

/** What the button must do on the way: get ready, begin recording, or end it and offer to save. */
export type RecEffect = 'arm' | 'start' | 'finish' | 'none';

export function nextRec(state: RecState, ev: RecEvent): { state: RecState; effect: RecEffect } {
  switch (state) {
    case 'off':
      if (ev.type === 'press')
        return ev.playing
          ? { state: 'recording', effect: 'start' }
          : { state: 'armed', effect: 'arm' };
      break;
    case 'armed':
      if (ev.type === 'press') return { state: 'off', effect: 'none' };
      if (ev.type === 'play') return { state: 'recording', effect: 'start' };
      break;
    case 'recording':
      if (ev.type === 'press' || ev.type === 'stop' || ev.type === 'limit')
        return { state: 'off', effect: 'finish' };
      break;
  }
  return { state, effect: 'none' };
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** `IvanDAW 2026-11-28 14-32-05.mp3`, local time. */
export function recordingFileName(d: Date): string {
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  return `IvanDAW ${date} ${time}.mp3`;
}

export const REC_LABELS: Record<RecState, string> = {
  off: 'Record',
  armed: 'Record: starts on Play',
  recording: 'Recording',
};

/** Time left as `m:ss`, counting down; whole seconds rounded up, so it shows 0:00 only at the end. */
export function formatRemaining(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds - 1e-6));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Under this many seconds left, the time turns red. */
export const REC_WARN_SECONDS = 10;
