import { describe, expect, it } from 'vitest';
import { projectPath } from './projectUrl';

describe('projectPath', () => {
  it('opens the demo by default and a named project with ?project=', () => {
    expect(projectPath('')).toBe('projects/demo.json');
    expect(projectPath('?project=sine&play_only')).toBe('projects/sine.json');
  });
  it('falls back to the demo for names that are not plain', () => {
    expect(projectPath('?project=../secret')).toBe('projects/demo.json');
    expect(projectPath('?project=')).toBe('projects/demo.json');
  });
});
