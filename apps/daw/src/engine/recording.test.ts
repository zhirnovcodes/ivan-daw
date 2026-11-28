import { describe, expect, it } from 'vitest';
import { RECORDER_PROCESSOR, RECORDER_WORKLET_SRC } from './recorderWorklet';
import { createFader, mp3OutputRate } from './recording';

const ones = (n: number) => new Float32Array(n).fill(1);

describe('mp3OutputRate', () => {
  it('keeps rates MP3 has', () => {
    expect(mp3OutputRate(48000)).toBe(48000);
    expect(mp3OutputRate(44100)).toBe(44100);
  });
  it('picks 44.1 or 48 kHz for the rest', () => {
    expect(mp3OutputRate(96000)).toBe(48000);
    expect(mp3OutputRate(192000)).toBe(48000);
    expect(mp3OutputRate(88200)).toBe(44100);
  });
});

describe('createFader', () => {
  it('fades in, holds the tail back, and fades it out at the end', () => {
    const f = createFader(4);
    const [a] = f.push(ones(6), ones(6));
    expect(Array.from(a)).toEqual([0, 0.25]); // 4 of 6 held back
    const [b] = f.push(ones(4), ones(4));
    expect(Array.from(b)).toEqual([0.5, 0.75, 1, 1]);
    const [tail, tailR] = f.finish();
    expect(Array.from(tail)).toEqual([0.75, 0.5, 0.25, 0]);
    expect(Array.from(tailR)).toEqual(Array.from(tail));
  });
  it('loses no frames across many chunks', () => {
    const f = createFader(10);
    let n = 0;
    for (let i = 0; i < 7; i++) n += f.push(ones(33), ones(33))[0].length;
    n += f.finish()[0].length;
    expect(n).toBe(7 * 33);
  });
  it('handles a recording shorter than the fade', () => {
    const f = createFader(100);
    expect(f.push(ones(5), ones(5))[0].length).toBe(0);
    const [tail] = f.finish();
    expect(tail.length).toBe(5);
    expect(tail[4]).toBe(0);
  });
});

/** Runs the worklet source with a fake AudioWorkletGlobalScope. */
function loadWorklet(maxFrames: number) {
  const sent: { type: string; l?: Float32Array; reason?: string; frames?: number }[] = [];
  let Proc: new (
    o: unknown,
  ) => {
    process(i: Float32Array[][]): boolean;
    port: { onmessage: (e: { data: unknown }) => void };
  } = undefined as never;
  class AudioWorkletProcessor {
    port = { onmessage: (_e: { data: unknown }) => {}, postMessage: (m: never) => sent.push(m) };
  }
  new Function('AudioWorkletProcessor', 'registerProcessor', RECORDER_WORKLET_SRC)(
    AudioWorkletProcessor,
    (name: string, p: typeof Proc) => {
      expect(name).toBe(RECORDER_PROCESSOR);
      Proc = p;
    },
  );
  const proc = new Proc({ processorOptions: { maxFrames } });
  return { proc, sent };
}

describe('recorder worklet', () => {
  const block = () => [[ones(128), ones(128)]];
  it('stops by itself at exactly maxFrames', () => {
    const { proc, sent } = loadWorklet(5000);
    for (let i = 0; i < 50; i++) proc.process(block());
    const frames = sent
      .filter((m) => m.type === 'chunk')
      .reduce((n, m) => n + (m.l?.length ?? 0), 0);
    expect(frames).toBe(5000);
    expect(sent.at(-1)).toEqual({ type: 'done', reason: 'limit', frames: 5000 });
    expect(sent.filter((m) => m.type === 'done')).toHaveLength(1);
  });
  it('stop flushes what it has', () => {
    const { proc, sent } = loadWorklet(1e9);
    proc.process(block());
    proc.port.onmessage({ data: 'stop' });
    expect(sent.map((m) => m.type)).toEqual(['chunk', 'done']);
    expect(sent[0]?.l?.length).toBe(128);
    expect(sent[1]?.reason).toBe('stop');
  });
  it('records silence when nothing is connected, and ends on dispose', () => {
    const { proc, sent } = loadWorklet(128);
    expect(proc.process([[]])).toBe(true);
    expect(Array.from(sent[0]?.l ?? []).every((v) => v === 0)).toBe(true);
    proc.port.onmessage({ data: 'dispose' });
    expect(proc.process(block())).toBe(false);
  });
});
