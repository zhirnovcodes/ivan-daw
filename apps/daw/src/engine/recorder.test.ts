import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMasterRecorder } from './recorder';
import type { EncoderIn, EncoderOut, WorkletOut } from './recording';

/** A fake AudioWorkletNode: the test plays the worklet's side through `fromWorklet`. */
class FakeNode {
  static last: FakeNode;
  toWorklet: unknown[] = [];
  port = {
    onmessage: null as ((e: { data: WorkletOut }) => void) | null,
    postMessage: (m: unknown) => this.toWorklet.push(m),
  };
  constructor(
    _ctx: unknown,
    readonly name: string,
    readonly opts: { processorOptions: { maxFrames: number } },
  ) {
    FakeNode.last = this;
  }
  fromWorklet(m: WorkletOut) {
    this.port.onmessage?.({ data: m });
  }
}

class FakeWorker {
  received: EncoderIn[] = [];
  terminated = false;
  onmessage: ((e: { data: EncoderOut }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  postMessage(m: EncoderIn) {
    this.received.push(m);
  }
  terminate() {
    this.terminated = true;
  }
  reply(m: EncoderOut) {
    this.onmessage?.({ data: m });
  }
}

function setup() {
  const addModule = vi.fn(async () => {});
  const ctx = { sampleRate: 48000, audioWorklet: { addModule } } as unknown as BaseAudioContext;
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const workers: FakeWorker[] = [];
  const rec = createMasterRecorder(ctx, source as unknown as AudioNode, () => {
    const w = new FakeWorker();
    workers.push(w);
    return w as unknown as Worker;
  });
  return { rec, addModule, source, workers };
}

const chunk = (n: number): WorkletOut => ({
  type: 'chunk',
  l: new Float32Array(n),
  r: new Float32Array(n),
});

describe('createMasterRecorder', () => {
  beforeEach(() => vi.stubGlobal('AudioWorkletNode', FakeNode));
  afterEach(() => vi.unstubAllGlobals());

  it('loads the worklet once and taps the source', async () => {
    const { rec, addModule, source } = setup();
    await rec.prepare();
    await rec.start();
    await rec.start();
    expect(addModule).toHaveBeenCalledTimes(1);
    expect(source.connect).toHaveBeenCalledWith(FakeNode.last);
    expect(FakeNode.last.opts.processorOptions.maxFrames).toBe(300 * 48000);
  });

  it('forwards chunks, and stop resolves with the encoder MP3', async () => {
    const { rec, workers, source } = setup();
    const r = await rec.start({ maxSeconds: 2 });
    const w = workers[0] as FakeWorker;
    expect(FakeNode.last.opts.processorOptions.maxFrames).toBe(96000);
    FakeNode.last.fromWorklet(chunk(4096));
    const done = r.stop();
    expect(FakeNode.last.toWorklet).toContain('stop');
    FakeNode.last.fromWorklet({ type: 'done', reason: 'stop', frames: 4096 });
    expect(w.received.map((m) => m.type)).toEqual(['init', 'chunk', 'finish']);
    expect(source.disconnect).toHaveBeenCalled();
    const blob = new Blob(['mp3']);
    w.reply({ type: 'mp3', blob });
    await expect(done).resolves.toBe(blob);
    expect(w.terminated).toBe(true);
  });

  it('calls onLimit once the worklet hits the limit; stop then just waits for the MP3', async () => {
    const { rec, workers } = setup();
    const onLimit = vi.fn();
    const r = await rec.start({ onLimit });
    FakeNode.last.fromWorklet({ type: 'done', reason: 'limit', frames: 1 });
    expect(onLimit).toHaveBeenCalledTimes(1);
    const done = r.stop();
    expect(FakeNode.last.toWorklet).not.toContain('stop');
    const blob = new Blob(['x']);
    workers[0]?.reply({ type: 'mp3', blob });
    await expect(done).resolves.toBe(blob);
  });

  it('cancel unhooks everything and never offers a file', async () => {
    const { rec, workers, source } = setup();
    const r = await rec.start();
    r.cancel();
    expect(source.disconnect).toHaveBeenCalled();
    expect(workers[0]?.terminated).toBe(true);
    await expect(r.stop()).rejects.toThrow('cancelled');
  });

  it('an encoder error rejects stop', async () => {
    const { rec, workers } = setup();
    const r = await rec.start();
    workers[0]?.reply({ type: 'error', message: 'boom' });
    await expect(r.stop()).rejects.toThrow('boom');
  });
});
