// Parameter maths for the generic strip. Pure functions; no DOM.
// The store keeps normalized 0..1 values; ParameterInfo ranges are min..max.

import type { ParameterInfo } from 'ivandaw-core';
import { clamp } from '../model/project';

/** Seconds between a trigger's rise to 1 and its fall back to 0. */
export const TRIGGER_RESET = 0.02;

const logScaled = (p: ParameterInfo): boolean => p.scale === 'log' && p.min > 0 && p.max > p.min;

/** Normalized 0..1 → value in min..max. int, choice, boolean and trigger round after denormalizing. */
export function denormalize(p: ParameterInfo, n: number): number {
  const t = clamp(Number.isFinite(n) ? n : 0, 0, 1);
  if (p.kind === 'float') {
    return logScaled(p) ? p.min * (p.max / p.min) ** t : p.min + t * (p.max - p.min);
  }
  return Math.round(p.min + t * (p.max - p.min));
}

/** Value in min..max → normalized 0..1. int, choice, boolean and trigger round first. */
export function normalize(p: ParameterInfo, value: number): number {
  const span = p.max - p.min;
  if (!(span > 0) || !Number.isFinite(value)) return 0;
  const v = clamp(p.kind === 'float' ? value : Math.round(value), p.min, p.max);
  const n = logScaled(p) ? Math.log(v / p.min) / Math.log(p.max / p.min) : (v - p.min) / span;
  return clamp(n, 0, 1);
}

/** Stored value, or the parameter's default when the user has not changed it. */
export function currentNormalized(p: ParameterInfo, stored: number | undefined): number {
  return stored ?? normalize(p, p.default);
}

/** The int stepper: one step up or down, clamped. Returns the new normalized value. */
export function stepNormalized(p: ParameterInfo, n: number, dir: 1 | -1): number {
  return normalize(p, clamp(denormalize(p, n) + dir, p.min, p.max));
}

/** Text next to a control: the plugin's own `format`, else a sensible default for the kind. */
export function valueLabel(p: ParameterInfo, n: number): string {
  const v = denormalize(p, n);
  if (p.format) return p.format(v);
  switch (p.kind) {
    case 'choice':
      return p.choices?.[v - p.min] ?? String(v);
    case 'boolean':
      return v >= 0.5 ? 'on' : 'off';
    case 'trigger':
      return '';
    case 'int':
      return p.unit ? `${v} ${p.unit}` : String(v);
    default: {
      const text = String(Number(v.toPrecision(3)));
      return p.unit ? `${text} ${p.unit}` : text;
    }
  }
}

/** The automation values (0..1) and their offset from now for a trigger press: rise, then reads back 0. */
export function triggerPulse(): { value: number; offset: number }[] {
  return [
    { value: 1, offset: 0 },
    { value: 0, offset: TRIGGER_RESET },
  ];
}
