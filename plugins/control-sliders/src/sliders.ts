// Control sliders' logic: two values, each sent out on its own modulation port as it changes.
// Design: docs/v1.1-tech-design.md, "6. Control sliders".

import type { PluginEvent } from 'ivandaw-core';

export const SLIDER_IDS = ['a', 'b'] as const;
export type SliderId = (typeof SLIDER_IDS)[number];
export const DEFAULT_VALUE = 0.5;

const isSlider = (id: string): id is SliderId => (SLIDER_IDS as readonly string[]).includes(id);

export interface Sliders {
  /** Plugin `schedule()` input: `automation` for `a` / `b`; everything else is ignored. */
  schedule(events: PluginEvent[]): void;
  value(id: string): number;
}

/**
 * `emit` gets the new value on the port of the same name, at the event's time.
 * `onChange` reports it as a parameter change.
 */
export function createSliders(
  emit: (e: PluginEvent) => void,
  onChange?: (id: SliderId, value: number) => void,
): Sliders {
  const values: Record<SliderId, number> = { a: DEFAULT_VALUE, b: DEFAULT_VALUE };
  return {
    schedule(events) {
      for (const e of events) {
        if (e.type !== 'automation' || !isSlider(e.id)) continue;
        const v = Math.min(1, Math.max(0, e.value));
        values[e.id] = v;
        onChange?.(e.id, v);
        emit({ type: 'automation', time: e.time, id: e.id, value: v, port: e.id });
      }
    },
    value: (id) => (isSlider(id) ? values[id] : 0),
  };
}
