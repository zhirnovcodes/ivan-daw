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
    { name: 'My Beat', mobile: false, file: 'my-beat.json' },
    { name: 'Drums', mobile: false, file: 'drums.json' },
    { name: 'Drums', mobile: true, file: 'drums.mobile.json' },
    { name: 'Pad', mobile: true, file: 'pad.mobile.json' },
  ];
  it('opens a saved preset by name, any case, over ?project', async () => {
    expect(await openPath('?preset=My%20Beat', list)).toEqual({ path: 'presets/my-beat.json' });
    expect(await openPath('?preset=my+beat&project=sine', list)).toEqual({
      path: 'presets/my-beat.json',
    });
    expect(await openPath('?preset=my-beat', list)).toEqual({ path: 'presets/my-beat.json' });
  });
  it('opens the kind for the page mode, else the other kind of that name', async () => {
    expect(await openPath('?preset=Drums', list, true)).toEqual({
      path: 'presets/drums.mobile.json',
    });
    expect(await openPath('?preset=Drums', list, false)).toEqual({ path: 'presets/drums.json' });
    expect(await openPath('?preset=My%20Beat', list, true)).toEqual({
      path: 'presets/my-beat.json',
      otherKind: true,
    });
    expect(await openPath('?preset=pad', list, false)).toEqual({
      path: 'presets/pad.mobile.json',
      otherKind: true,
    });
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
