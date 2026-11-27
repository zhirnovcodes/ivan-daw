// Mobile (2026-11-27): a locked screen or a hidden page stops the sound. Phones keep a hidden
// page's audio running but starve it of CPU, so it crackles. Hidden: pause the transport, then
// suspend the AudioContext once the pause's fade is done. Visible again: wake the context (the
// transport stays paused until Play); if the browser wants a tap first, the next tap does it.

/** Time for the pause's note-off fades to finish before the context is suspended. */
export const SUSPEND_DELAY_MS = 150;

export interface SleepDeps {
  /** Emits visibilitychange and has `hidden`. */
  doc: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;
  /** Pauses the transport (it silences held notes). */
  pause: () => void;
  /** Suspends the AudioContext. */
  suspend: () => Promise<void>;
  /** Wakes the AudioContext and re-arms the wake-on-first-tap. */
  wake: () => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}

/** Stops the sound while the page is hidden. Returns remove. */
export function sleepWhenHidden(deps: SleepDeps): () => void {
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  let timer: unknown;
  const onChange = (): void => {
    if (timer !== undefined) clearTimer(timer);
    timer = undefined;
    if (deps.doc.hidden) {
      deps.pause();
      timer = setTimer(() => {
        timer = undefined;
        if (deps.doc.hidden) void deps.suspend().catch(() => {});
      }, SUSPEND_DELAY_MS);
    } else {
      deps.wake();
    }
  };
  deps.doc.addEventListener('visibilitychange', onChange);
  return () => {
    deps.doc.removeEventListener('visibilitychange', onChange);
    if (timer !== undefined) clearTimer(timer);
  };
}
