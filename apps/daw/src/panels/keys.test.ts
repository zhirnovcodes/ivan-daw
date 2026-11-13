import { describe, expect, it } from 'vitest';
import { shouldTogglePlay } from './keys';

const space = { key: ' ' };

describe('shouldTogglePlay', () => {
  it('toggles on Space when focus is on the page', () => {
    expect(shouldTogglePlay({ ...space, tag: '' })).toBe(true);
    expect(shouldTogglePlay({ ...space, tag: 'body' })).toBe(true);
    expect(shouldTogglePlay({ ...space, tag: 'div' })).toBe(true);
  });
  it('ignores other keys', () => {
    expect(shouldTogglePlay({ key: 'a', tag: '' })).toBe(false);
    expect(shouldTogglePlay({ key: 'Enter', tag: '' })).toBe(false);
  });
  it('leaves text fields alone', () => {
    expect(shouldTogglePlay({ ...space, tag: 'input', inputType: 'text' })).toBe(false);
    expect(shouldTogglePlay({ ...space, tag: 'input', inputType: 'number' })).toBe(false);
    expect(shouldTogglePlay({ ...space, tag: 'textarea' })).toBe(false);
    expect(shouldTogglePlay({ ...space, tag: 'div', isContentEditable: true })).toBe(false);
  });
  it('leaves controls that use Space themselves alone', () => {
    expect(shouldTogglePlay({ ...space, tag: 'button' })).toBe(false);
    expect(shouldTogglePlay({ ...space, tag: 'select' })).toBe(false);
    expect(shouldTogglePlay({ ...space, tag: 'input', inputType: 'checkbox' })).toBe(false);
  });
  it('works from a slider', () => {
    expect(shouldTogglePlay({ ...space, tag: 'input', inputType: 'range' })).toBe(true);
  });
  it('ignores shortcuts and key repeat', () => {
    expect(shouldTogglePlay({ ...space, tag: '', ctrlKey: true })).toBe(false);
    expect(shouldTogglePlay({ ...space, tag: '', metaKey: true })).toBe(false);
    expect(shouldTogglePlay({ ...space, tag: '', repeat: true })).toBe(false);
  });
});
