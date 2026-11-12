// AudioParam helpers. Every gain change in the host goes through these, so nothing jumps.
// Tech design: "Fades and clicks".

/** Time constant for volume / pan changes: `setTargetAtTime(v, now, 0.01)`. */
export const PARAM_TIME_CONSTANT = 0.01;
/** Strip fade when a node is removed. */
export const REMOVE_FADE = 0.01;
/** When the strip disconnects and the instance is disposed, after the fade starts. */
export const REMOVE_DISPOSE_MS = 20;

/**
 * Freezes the param at its value at time `t` and drops later automation.
 * `cancelAndHoldAtTime` is missing in Firefox; there we hold the current value instead.
 */
export function holdAt(param: AudioParam, t: number): void {
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(t);
  } else {
    const v = param.value;
    param.cancelScheduledValues(t);
    param.setValueAtTime(v, t);
  }
}

/** Straight-line ramp from wherever the param is at `t` to `v` at `t + d`. */
export function rampTo(param: AudioParam, v: number, t: number, d: number): void {
  holdAt(param, t);
  param.linearRampToValueAtTime(v, t + d);
}

/** Smooth approach for slider changes (volume, pan): never clicks, however fast the slider moves. */
export function glideTo(param: AudioParam, v: number, t: number): void {
  holdAt(param, t);
  param.setTargetAtTime(v, t, PARAM_TIME_CONSTANT);
}
