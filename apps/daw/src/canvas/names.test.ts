import { describe, expect, it } from 'vitest';
import { armName, displayNames } from './names';

describe('displayNames / armName', () => {
  it('numbers repeated plugins from the second one on', () => {
    const names = displayNames(
      [
        { id: 'n1', plugin: 'lfo' },
        { id: 'n2', plugin: 'sine' },
        { id: 'n3', plugin: 'sine' },
      ],
      (p) => (p === 'lfo' ? 'LFO' : 'Sine synth'),
    );
    expect([...names.values()]).toEqual(['LFO', 'Sine synth', 'Sine synth 2']);
    expect(armName({ from: { node: 'n1', index: 1 }, to: { node: 'n3', index: 3 } }, names)).toBe(
      '"LFO".1 - "Sine synth 2".3',
    );
  });
});
