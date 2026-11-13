import type { ParameterInfo } from 'ivandaw-core';
import { describe, expect, it } from 'vitest';
import { controlChoices, spotOf } from './controls';

const p = (id: string, group?: string, automatable = true): ParameterInfo => ({
  id,
  label: id.toUpperCase(),
  kind: 'float',
  min: 0,
  max: 1,
  default: 0,
  automatable,
  ...(group ? { group } : {}),
});

describe('control choices', () => {
  it('lists Volume and Pan first, then automatable parameters grouped', () => {
    const list = controlChoices(true, [
      p('a', 'Loop'),
      p('b', 'Fx'),
      p('c', 'Loop'),
      p('d', 'Fx', false),
    ]);
    expect(list.map((c) => c.port)).toEqual([
      'ctl:gain',
      'ctl:pan',
      'ctl:param:a',
      'ctl:param:c',
      'ctl:param:b',
    ]);
    expect(list[2]).toEqual({ port: 'ctl:param:a', label: 'A', group: 'Loop' });
  });

  it('has no Volume / Pan without a strip', () => {
    expect(controlChoices(false, [p('rate')]).map((c) => c.port)).toEqual(['ctl:param:rate']);
    expect(controlChoices(false, [])).toEqual([]);
  });

  it('draws every control input at the one ctl spot', () => {
    expect(spotOf('ctl:gain')).toBe('ctl');
    expect(spotOf('ctl:param:x')).toBe('ctl');
    expect(spotOf('in')).toBe('in');
  });
});
