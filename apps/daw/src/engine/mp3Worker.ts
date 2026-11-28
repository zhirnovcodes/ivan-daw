// The recorder's MP3 encoder (2026-11-28): a Web Worker running LAME compiled to WebAssembly
// (wasm-media-encoders, MIT; LAME itself is LGPL and loads as its own .wasm file). It encodes each
// chunk as it arrives, so the MP3 is ready the moment recording stops and memory stays at the MP3's size.
// Only mp3.wasm (~130 KB) is fetched, served next to the app; the package's all-in-one entry is not used.

import { createEncoder, type WasmMediaEncoder } from 'wasm-media-encoders';
import wasmUrl from 'wasm-media-encoders/wasm/mp3?url';
import {
  createFader,
  type EncoderIn,
  type EncoderOut,
  MP3_BITRATE,
  mp3OutputRate,
  RECORD_FADE_SECONDS,
} from './recording';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (m: EncoderOut): void => scope.postMessage(m);

let encoder: WasmMediaEncoder<'audio/mpeg'> | undefined;
let fader = createFader(1);
const parts: Uint8Array[] = [];
/** Handles messages one at a time, in order; `init` is async (fetching the wasm). */
let chain: Promise<void> = Promise.resolve();
let failed = false;

// `encode` returns a view into wasm memory that the next call overwrites: copy it.
const keep = (bytes: Uint8Array): void => {
  if (bytes.length > 0) parts.push(bytes.slice());
};

async function handle(m: EncoderIn): Promise<void> {
  if (m.type === 'init') {
    const module = await WebAssembly.compileStreaming(fetch(wasmUrl));
    encoder = await createEncoder('audio/mpeg', module);
    encoder.configure({
      channels: 2,
      sampleRate: m.sampleRate,
      bitrate: MP3_BITRATE,
      outputSampleRate: mp3OutputRate(m.sampleRate),
    });
    fader = createFader(Math.max(1, Math.round(RECORD_FADE_SECONDS * m.sampleRate)));
    return;
  }
  if (!encoder) throw new Error('MP3 encoder not ready');
  if (m.type === 'chunk') {
    const [l, r] = fader.push(m.l, m.r);
    if (l.length > 0) keep(encoder.encode([l, r]));
    return;
  }
  const [l, r] = fader.finish();
  if (l.length > 0) keep(encoder.encode([l, r]));
  keep(encoder.finalize());
  post({ type: 'mp3', blob: new Blob(parts as BlobPart[], { type: 'audio/mpeg' }) });
}

scope.onmessage = (e: MessageEvent<EncoderIn>) => {
  chain = chain
    .then(() => (failed ? undefined : handle(e.data)))
    .catch((err: unknown) => {
      failed = true;
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    });
};
