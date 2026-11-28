// Records Master's output to MP3 (2026-11-28). See recording.ts for the pipeline.
// `start()` taps Master with an AudioWorkletNode (no outputs, so it changes nothing you hear) and
// starts an encoder worker. `stop()` resolves with the MP3; `cancel()` throws the recording away.

import { RECORDER_PROCESSOR, RECORDER_WORKLET_SRC } from './recorderWorklet';
import { type EncoderIn, type EncoderOut, RECORD_MAX_SECONDS, type WorkletOut } from './recording';

export interface RecordingOptions {
  /** Default RECORD_MAX_SECONDS. */
  maxSeconds?: number;
  /** The limit was reached: recording has ended by itself; `stop()` gives the MP3. */
  onLimit?: () => void;
}

export interface Recording {
  /** Ends the recording (if the limit didn't already) and resolves with the MP3. */
  stop(): Promise<Blob>;
  /** Ends it and throws it away. */
  cancel(): void;
}

export interface MasterRecorder {
  /** Loads the worklet ahead of time, so `start()` begins at once. Safe to call often. */
  prepare(): Promise<void>;
  start(opts?: RecordingOptions): Promise<Recording>;
}

const defaultWorker = (): Worker =>
  new Worker(new URL('./mp3Worker.ts', import.meta.url), { type: 'module' });

export function createMasterRecorder(
  ctx: BaseAudioContext,
  source: AudioNode,
  makeWorker: () => Worker = defaultWorker,
): MasterRecorder {
  let loaded: Promise<void> | undefined;

  const prepare = (): Promise<void> => {
    loaded ??= (async () => {
      const url = URL.createObjectURL(
        new Blob([RECORDER_WORKLET_SRC], { type: 'text/javascript' }),
      );
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
    })().catch((e: unknown) => {
      loaded = undefined; // let a later press try again
      throw e;
    });
    return loaded;
  };

  async function start(opts: RecordingOptions = {}): Promise<Recording> {
    await prepare();
    const maxFrames = Math.round((opts.maxSeconds ?? RECORD_MAX_SECONDS) * ctx.sampleRate);
    const node = new AudioWorkletNode(ctx, RECORDER_PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 2,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
      processorOptions: { maxFrames },
    });
    const worker = makeWorker();
    const send = (m: EncoderIn, transfer: Transferable[] = []): void =>
      worker.postMessage(m, transfer);

    let resolve!: (b: Blob) => void;
    let reject!: (e: Error) => void;
    const result = new Promise<Blob>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    result.catch(() => {}); // a cancelled or unsaved recording has no one waiting on it

    let tapped = true;
    let ended = false;
    const untap = (): void => {
      if (!tapped) return;
      tapped = false;
      node.port.onmessage = null;
      node.port.postMessage('dispose');
      try {
        source.disconnect(node);
      } catch {
        // already gone with the context
      }
    };
    const fail = (message: string): void => {
      untap();
      worker.terminate();
      reject(new Error(message));
    };

    worker.onmessage = (e: MessageEvent<EncoderOut>) => {
      const m = e.data;
      worker.terminate();
      if (m.type === 'mp3') resolve(m.blob);
      else fail(`MP3 encoder: ${m.message}`);
    };
    worker.onerror = (e) => {
      e.preventDefault();
      fail(`MP3 encoder: ${e.message || 'failed to start'}`);
    };
    node.port.onmessage = (e: MessageEvent<WorkletOut>) => {
      const m = e.data;
      if (m.type === 'chunk') {
        send(m, [m.l.buffer, m.r.buffer]);
        return;
      }
      ended = true;
      untap();
      send({ type: 'finish' });
      if (m.reason === 'limit') opts.onLimit?.();
    };

    send({ type: 'init', sampleRate: ctx.sampleRate });
    source.connect(node);

    return {
      stop() {
        if (!ended && tapped) node.port.postMessage('stop');
        return result;
      },
      cancel() {
        untap();
        worker.terminate();
        reject(new Error('cancelled'));
      },
    };
  }

  return { prepare, start };
}
