import type { PluginInstance } from 'ivandaw-core';
import { describe, expect, it, vi } from 'vitest';
import { type Mounted, syncPluginUis, type UiSyncInput } from './pluginUi';

/** A stand-in slot: only `replaceChildren` is used. */
const slot = () => ({ replaceChildren: vi.fn() }) as unknown as HTMLElement;

function fakeInstance(): PluginInstance & { log: string[] } {
  const log: string[] = [];
  return {
    log,
    mount: (el: HTMLElement) => {
      log.push(`mount ${el === undefined ? '?' : 'slot'}`);
    },
    unmount: () => {
      log.push('unmount');
    },
  } as unknown as PluginInstance & { log: string[] };
}

function input(
  slots: Record<string, HTMLElement>,
  status: Record<string, string>,
  instances: Record<string, PluginInstance>,
): UiSyncInput & { errors: string[] } {
  const errors: string[] = [];
  return {
    errors,
    slots: new Map(Object.entries(slots)),
    status,
    instance: (id) => instances[id],
    onError: (id, m) => errors.push(`${id}: ${m}`),
  };
}

describe('syncPluginUis', () => {
  it('mounts once the node is ready and has a slot, and only once', () => {
    const s = slot();
    const inst = fakeInstance();
    const mounted = new Map<string, Mounted>();
    syncPluginUis(mounted, input({ n1: s }, { n1: 'loading' }, {}));
    expect(mounted.size).toBe(0);
    syncPluginUis(mounted, input({ n1: s }, { n1: 'ready' }, { n1: inst }));
    syncPluginUis(mounted, input({ n1: s }, { n1: 'ready' }, { n1: inst }));
    expect(inst.log).toEqual(['mount slot']);
    expect(mounted.get('n1')).toEqual({ slot: s, instance: inst });
  });

  it('unmounts and clears the slot when the box goes away', () => {
    const s = slot();
    const inst = fakeInstance();
    const mounted = new Map<string, Mounted>();
    syncPluginUis(mounted, input({ n1: s }, { n1: 'ready' }, { n1: inst }));
    syncPluginUis(mounted, input({}, { n1: 'ready' }, { n1: inst }));
    expect(inst.log).toEqual(['mount slot', 'unmount']);
    expect(s.replaceChildren).toHaveBeenCalled();
    expect(mounted.size).toBe(0);
  });

  it('unmounts when the node stops being ready', () => {
    const s = slot();
    const inst = fakeInstance();
    const mounted = new Map<string, Mounted>();
    syncPluginUis(mounted, input({ n1: s }, { n1: 'ready' }, { n1: inst }));
    syncPluginUis(mounted, input({ n1: s }, { n1: 'error' }, { n1: inst }));
    expect(inst.log).toEqual(['mount slot', 'unmount']);
  });

  it('moves to a new instance: old one unmounted before the new one mounts', () => {
    const s = slot();
    const a = fakeInstance();
    const b = fakeInstance();
    const order: string[] = [];
    a.unmount = () => order.push('a unmount');
    b.mount = () => order.push('b mount');
    const mounted = new Map<string, Mounted>([['n1', { slot: s, instance: a }]]);
    syncPluginUis(mounted, input({ n1: s }, { n1: 'ready' }, { n1: b }));
    expect(order).toEqual(['a unmount', 'b mount']);
  });

  it('reports a plugin that throws, and keeps going with the others', () => {
    const bad = fakeInstance();
    bad.mount = () => {
      throw new Error('boom');
    };
    const good = fakeInstance();
    const mounted = new Map<string, Mounted>();
    const inp = input(
      { n1: slot(), n2: slot() },
      { n1: 'ready', n2: 'ready' },
      { n1: bad, n2: good },
    );
    syncPluginUis(mounted, inp);
    expect(inp.errors).toEqual(['n1: mount failed: boom']);
    expect(good.log).toEqual(['mount slot']);
  });
});
