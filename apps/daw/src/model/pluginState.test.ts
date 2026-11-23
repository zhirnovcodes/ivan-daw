import { describe, expect, it } from 'vitest';
import { captureState, restoreState } from './pluginState';

describe('plugin state round trip', () => {
  it('keeps data and stores each file as a path', async () => {
    const stored: Blob[] = [];
    const saved = await captureState(
      {
        pluginId: 'p',
        pluginVersion: '1',
        data: { a: 1 },
        files: { b: new Blob(['B']), a: new Blob(['A']) },
      },
      async (blob) => {
        stored.push(blob);
        return `presets/files/${stored.length}`;
      },
    );
    expect(saved).toEqual({
      pluginId: 'p',
      pluginVersion: '1',
      data: { a: 1 },
      files: { a: 'presets/files/1', b: 'presets/files/2' },
    });

    const asked: string[] = [];
    const fakeFetch = (async (url: string) => {
      asked.push(url);
      const i = Number(url.slice(-1)) - 1;
      return new Response(stored[i]);
    }) as typeof fetch;
    const back = await restoreState(saved, '/', fakeFetch);
    expect(asked).toEqual(['/presets/files/1', '/presets/files/2']);
    expect(back.data).toEqual({ a: 1 });
    expect(await back.files?.a?.text()).toBe('A');
    expect(await back.files?.b?.text()).toBe('B');
  });

  it('leaves files out when there are none', async () => {
    const saved = await captureState(
      { pluginId: 'p', pluginVersion: '1', data: null },
      async () => {
        throw new Error('not called');
      },
    );
    expect(saved).toEqual({ pluginId: 'p', pluginVersion: '1', data: null });
    expect(await restoreState(saved, '/')).toEqual({
      pluginId: 'p',
      pluginVersion: '1',
      data: null,
    });
  });

  it('fails on a missing file', async () => {
    const fakeFetch = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    await expect(
      restoreState(
        { pluginId: 'p', pluginVersion: '1', data: null, files: { a: 'x' } },
        '/',
        fakeFetch,
      ),
    ).rejects.toThrow('HTTP 404');
  });
});
