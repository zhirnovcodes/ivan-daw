import { describe, expect, it } from 'vitest';
import { anyLoading } from './loading';

const nodes = [{ id: 'a' }, { id: 'b' }];

describe('anyLoading', () => {
  it('is false when every node is ready', () => {
    expect(anyLoading(nodes, { a: 'ready', b: 'ready' })).toBe(false);
  });
  it('is true while one node is loading', () => {
    expect(anyLoading(nodes, { a: 'ready', b: 'loading' })).toBe(true);
  });
  it('treats a node with no status yet as loading', () => {
    expect(anyLoading(nodes, { a: 'ready' })).toBe(true);
  });
  it('does not wait for a node that failed', () => {
    expect(anyLoading(nodes, { a: 'ready', b: 'error' })).toBe(false);
  });
  it('is false for an empty project', () => {
    expect(anyLoading([], {})).toBe(false);
  });
});
