import { describe, expect, it } from 'vitest';
import { openPath, projectPath } from './projectUrl';

describe('projectPath', () => {
  it('opens the demo by default and a named project with ?project=', () => {
    expect(projectPath('')).toBe('projects/demo.json');
    expect(projectPath('?project=sine&mode=play_only')).toBe('projects/sine.json');
  });
  it('falls back to the demo for names that are not plain', () => {
    expect(projectPath('?project=../secret')).toBe('projects/demo.json');
    expect(projectPath('?project=')).toBe('projects/demo.json');
  });
});

describe('openPath', () => {
  const list = async () => [
    { name: 'My Beat', file: 'my-beat.json' },
    { name: 'Drums', file: 'drums.json' },
  ];
  it('opens a saved preset by name, any case, over ?project', async () => {
    expect(await openPath('?preset=My%20Beat', list)).toEqual({ path: 'presets/my-beat.json' });
    expect(await openPath('?preset=my+beat&project=sine', list)).toEqual({
      path: 'presets/my-beat.json',
    });
    expect(await openPath('?preset=my-beat', list)).toEqual({ path: 'presets/my-beat.json' });
  });
  it('falls back to ?project and reports a name that is not saved', async () => {
    expect(await openPath('?preset=Nope&project=sine', list)).toEqual({
      path: 'projects/sine.json',
      missing: 'Nope',
    });
  });
  it('does not read the list without ?preset', async () => {
    const never = async () => {
      throw new Error('not called');
    };
    expect(await openPath('?project=sine', never)).toEqual({ path: 'projects/sine.json' });
    expect(await openPath('?preset=', never)).toEqual({ path: 'projects/demo.json' });
  });
});
