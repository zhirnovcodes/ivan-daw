import type { ParameterInfo } from 'ivandaw-core';
import { describe, expect, it } from 'vitest';
import {
  currentNormalized,
  denormalize,
  normalize,
  stepNormalized,
  triggerPulse,
  valueLabel,
} from './params';

const base = { label: 'x', default: 0, automatable: true } as const;
const float: ParameterInfo = { ...base, id: 'f', kind: 'float', min: -12, max: 12 };
const logf: ParameterInfo = { ...base, id: 'l', kind: 'float', min: 20, max: 20000, scale: 'log' };
const int: ParameterInfo = { ...base, id: 'i', kind: 'int', min: 1, max: 8, default: 4 };
const choice: ParameterInfo = {
  ...base,
  id: 'c',
  kind: 'choice',
  min: 0,
  max: 3,
  choices: ['sine', 'tri', 'saw', 'square'],
};
const bool: ParameterInfo = { ...base, id: 'b', kind: 'boolean', min: 0, max: 1 };
const trig: ParameterInfo = { ...base, id: 't', kind: 'trigger', min: 0, max: 1 };

describe('float', () => {
  it('maps linearly', () => {
    expect(denormalize(float, 0)).toBe(-12);
    expect(denormalize(float, 0.5)).toBe(0);
    expect(normalize(float, 12)).toBe(1);
    expect(normalize(float, 6)).toBe(0.75);
  });
  it('maps log scale', () => {
    expect(denormalize(logf, 0)).toBeCloseTo(20);
    expect(denormalize(logf, 1)).toBeCloseTo(20000);
    expect(denormalize(logf, 0.5)).toBeCloseTo(632.46, 1);
    expect(normalize(logf, 632.456)).toBeCloseTo(0.5, 3);
  });
  it('clamps', () => {
    expect(denormalize(float, 2)).toBe(12);
    expect(normalize(float, -100)).toBe(0);
  });
});

describe('int', () => {
  it('rounds after denormalizing', () => {
    expect(denormalize(int, 0)).toBe(1);
    expect(denormalize(int, 1)).toBe(8);
    expect(denormalize(int, 0.5)).toBe(5); // 4.5 → 5
    expect(denormalize(int, 0.3)).toBe(3); // 3.1 → 3
    expect(Number.isInteger(denormalize(int, 0.77))).toBe(true);
  });
  it('round trips', () => {
    for (let v = 1; v <= 8; v++) expect(denormalize(int, normalize(int, v))).toBe(v);
  });
  it('steps and stops at the ends', () => {
    const n4 = normalize(int, 4);
    expect(denormalize(int, stepNormalized(int, n4, 1))).toBe(5);
    expect(denormalize(int, stepNormalized(int, n4, -1))).toBe(3);
    expect(stepNormalized(int, 1, 1)).toBe(1);
    expect(stepNormalized(int, 0, -1)).toBe(0);
  });
});

describe('choice', () => {
  it('rounds to a choice index', () => {
    expect(denormalize(choice, 0.4)).toBe(1); // 1.2 → 1
    expect(denormalize(choice, 0.9)).toBe(3); // 2.7 → 3
    expect(valueLabel(choice, normalize(choice, 2))).toBe('saw');
  });
  it('round trips every index', () => {
    for (let v = 0; v <= 3; v++) expect(denormalize(choice, normalize(choice, v))).toBe(v);
  });
});

describe('boolean and trigger', () => {
  it('boolean is 0 or 1', () => {
    expect(denormalize(bool, 0.49)).toBe(0);
    expect(denormalize(bool, 0.5)).toBe(1);
    expect(valueLabel(bool, 1)).toBe('on');
  });
  it('trigger rounds like a boolean and shows no value text', () => {
    expect(denormalize(trig, 0.7)).toBe(1);
    expect(denormalize(trig, 0.2)).toBe(0);
    expect(valueLabel(trig, 1)).toBe('');
  });
  it('trigger rises to 1 then reads back 0', () => {
    expect(triggerPulse()).toEqual([
      { value: 1, offset: 0 },
      { value: 0, offset: 0.02 },
    ]);
  });
});

describe('labels', () => {
  it('uses the plugin format when given', () => {
    const level: ParameterInfo = { ...float, min: 0, max: 1.5, format: (v) => `${v * 2} fmt` };
    expect(valueLabel(level, 0.5)).toBe('1.5 fmt');
  });
  it('falls back to value and unit', () => {
    expect(valueLabel({ ...float, unit: 'dB' }, 0.75)).toBe('6 dB');
    expect(valueLabel({ ...int, unit: 'st' }, normalize(int, 3))).toBe('3 st');
  });
  it('uses the default when nothing is stored', () => {
    expect(currentNormalized(int, undefined)).toBeCloseTo(3 / 7);
    expect(currentNormalized(int, 0.9)).toBe(0.9);
  });
});
