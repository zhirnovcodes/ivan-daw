// The Record group (2026-11-28): a circle plus REC (off), 5:00 (waiting) or the time left, left of the
// beat readout, desktop only. States and rules: record.ts.
// When a recording ends (Stop, Record again, or the 5-minute limit; playback goes on):
//   "Save progress?"  Yes → the MP3 downloads to the browser's Downloads folder.
//                     No  → "Are you sure? Your recording will be deleted"  Yes → gone, No → back.

import { computed, effect, signal } from '@preact/signals-core';
import { RECORD_MAX_SECONDS } from '../engine/recording';
import { deps, playing } from '../store/store';
import { askYesNo, showMessage } from './dialog';
import { h } from './dom';
import {
  formatRemaining,
  nextRec,
  REC_LABELS,
  REC_WARN_SECONDS,
  type RecEvent,
  type RecState,
  recordingFileName,
} from './record';
import { panelServices, type RecordingHandle } from './services';

const TITLE = 'Recording';
const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  // Firefox still reads the URL just after the click.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function offerSave(mp3: Promise<Blob>, name: string): Promise<void> {
  for (;;) {
    if (await askYesNo(TITLE, 'Save progress?', true)) {
      try {
        download(await mp3, name);
      } catch (e) {
        await showMessage(TITLE, `The recording could not be saved: ${errText(e)}`);
      }
      return;
    }
    if (await askYesNo(TITLE, 'Are you sure? Your recording will be deleted')) return;
  }
}

export function createRecordButton(): { els: HTMLElement[]; dispose(): void } {
  const btn = h('button', 'ivp-rec');
  btn.type = 'button';
  btn.append(h('span', 'ivp-rec-dot'));
  btn.disabled = panelServices().recorder() === undefined;
  const caption = h('span', 'ivp-rec-cap');
  caption.setAttribute('aria-live', 'off');
  const group = h('span', 'ivp-rec-group');
  group.append(btn, caption);

  const state = signal<RecState>('off');
  /** The recording in progress (its start may still be pending). */
  let session: Promise<RecordingHandle> | undefined;
  let startedAt = new Date();
  /** AudioContext seconds when the current recording began; undefined until its start resolves. */
  let t0: number | undefined;
  let frame = 0;

  const showTime = (): void => {
    const left =
      t0 === undefined ? RECORD_MAX_SECONDS : RECORD_MAX_SECONDS - (panelServices().now() - t0);
    const text = formatRemaining(left);
    if (caption.textContent !== text) caption.textContent = text;
    caption.classList.toggle('warn', left < REC_WARN_SECONDS);
  };
  const tick = (): void => {
    showTime();
    frame = requestAnimationFrame(tick);
  };
  /** Recordings not yet saved or deleted: leaving the page asks first. */
  let unsaved = 0;

  const dispatch = (ev: RecEvent): void => {
    const { state: next, effect: fx } = nextRec(state.peek(), ev);
    state.value = next;
    const rec = panelServices().recorder();
    if (fx === 'arm') {
      rec?.prepare().catch((e: unknown) => console.error('[record] worklet failed to load', e));
    } else if (fx === 'start' && rec) {
      startedAt = new Date();
      t0 = undefined;
      const s = rec.start({
        onLimit: () => {
          if (session === s) dispatch({ type: 'limit' });
        },
      });
      session = s;
      unsaved++;
      s.then(
        () => {
          if (session === s) t0 = panelServices().now();
        },
        () => {},
      );
      s.catch((e: unknown) => {
        if (session === s) {
          session = undefined;
          state.value = 'off';
        }
        unsaved--;
        void showMessage(TITLE, `Recording could not start: ${errText(e)}`);
      });
    } else if (fx === 'finish') {
      const s = session;
      session = undefined;
      if (!s) return;
      // A failed start already said so, and already took itself off `unsaved`.
      const name = recordingFileName(startedAt);
      s.then(
        (r) => void offerSave(r.stop(), name).finally(() => unsaved--),
        () => {},
      );
    }
  };

  btn.addEventListener('click', () => {
    dispatch({ type: 'press', playing: playing.peek() });
    btn.blur(); // Space keeps toggling Play
  });

  // Stop means stopped at the top. Pause leaves the beat where it was, and keeps recording.
  const stopped = computed(() => {
    const s = deps.value.scheduler.state.value;
    return !s.playing && s.beat === 0;
  });
  let wasPlaying = playing.peek();
  let wasStopped = stopped.peek();

  const onUnload = (e: BeforeUnloadEvent): void => {
    if (unsaved > 0) e.preventDefault();
  };
  window.addEventListener('beforeunload', onUnload);

  const stops = [
    effect(() => {
      const on = playing.value;
      if (on && !wasPlaying) dispatch({ type: 'play' });
      wasPlaying = on;
    }),
    effect(() => {
      const s = stopped.value;
      if (s && !wasStopped) dispatch({ type: 'stop' });
      wasStopped = s;
    }),
    effect(() => {
      const s = state.value;
      btn.dataset.state = s;
      btn.title = REC_LABELS[s];
      btn.setAttribute('aria-label', REC_LABELS[s]);
      btn.setAttribute('aria-pressed', String(s !== 'off'));
      caption.dataset.state = s;
      cancelAnimationFrame(frame);
      if (s === 'recording') tick();
      else {
        caption.textContent = s === 'armed' ? formatRemaining(RECORD_MAX_SECONDS) : 'REC';
        caption.classList.remove('warn');
      }
    }),
  ];

  return {
    els: [group],
    dispose() {
      for (const s of stops) s();
      cancelAnimationFrame(frame);
      window.removeEventListener('beforeunload', onUnload);
      const s = session;
      session = undefined;
      s?.then(
        (r) => r.cancel(),
        () => {},
      );
    },
  };
}
