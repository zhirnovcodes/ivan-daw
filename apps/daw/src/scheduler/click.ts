// The ?click=1 debug blip: 20 ms of 1 kHz into Master, with a 2 ms fade in and an 18 ms fade out
// so the blip itself never clicks. It uses the engine's context; it never creates one.

const FREQ = 1000;
const PEAK = 0.3;
const ATTACK = 0.002;
const LENGTH = 0.02;

/** Cancels a click that has not started yet (on Pause / Stop); one already sounding finishes its blip. */
export interface ClickHandle {
  readonly time: number;
  cancel(): void;
}

export function playClick(ctx: AudioContext, dest: AudioNode, t: number): ClickHandle {
  const start = Math.max(t, ctx.currentTime);
  const osc = ctx.createOscillator();
  const vca = ctx.createGain();
  osc.frequency.value = FREQ;
  vca.gain.setValueAtTime(0, start);
  vca.gain.linearRampToValueAtTime(PEAK, start + ATTACK);
  vca.gain.linearRampToValueAtTime(0, start + LENGTH);
  osc.connect(vca);
  vca.connect(dest);
  osc.start(start);
  osc.stop(start + LENGTH + 0.005);
  osc.onended = () => {
    osc.disconnect();
    vca.disconnect();
  };
  return {
    time: start,
    cancel() {
      if (ctx.currentTime < start) osc.stop();
    },
  };
}
